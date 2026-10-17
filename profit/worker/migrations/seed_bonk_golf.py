"""One-time seed: Bonk Golf's creator link (Ambassadors), built 2026-10-16.

Writes seed_bonk_golf.sql, run ONCE against the shared D1:
  npx wrangler d1 execute mobius-account-health --remote --file migrations/seed_bonk_golf.sql
Needs LUCIDE_NODES = path to lucide-static@1.46.0/icon-nodes.json.

Bonk is not on TRYBE yet (Cole, 2026-10-16), so the submit link is left empty: the page hides the
button until a campaign link is pasted on the Ambassadors tab. The board is hand-picked, one video
per idea, in the order below (board_sort):
  - OUR videos: Bonk's own Meta video ads that sold (Triple Whale last click, ad set first; account
    runs about 1.3x, break-even 1.51x). 243 A $23.5k at 1.68x / 586 orders; 280 C 2.61x; 239 A 2.43x;
    224 A 1.69x; 246 C 1.61x; 236 B 1.57x; 285-1 1.45x (the Breakfast Ball drop). 278 B (1.79x) and 276 B
    (2.04x) were left off: both are motion graphics a creator cannot copy.
  - OTHER BRANDS' videos: Atria clips stored in R2 at amb/brand_bonk_golf/inspo-<name>.mp4 (uploaded by
    hand the same day), shown as "<brand>, not us". Melin, Vessel, Primo (Cole's picks) plus Pins & Aces
    (a hat with a magnet marker), Hondo and Caddy Splash. Research: docs/research-2026-10-16/bonk-golf.md.
Rules from Floyd (owner): real Bonk hats only, never AI; no competitor names on camera; Southpaw only in
lefty videos; never "sweat stain resistant" on PF 2.0; "patented" not cleared. No sales numbers on the
public link. Re-running replaces Bonk's sections, ideas and videos (the R2 files stay).
"""
import json, os, secrets

ACT = 'brand_bonk_golf'
META_ACT = 'act_12528825'   # Bonk's Meta ad account: ads live under it, proof rows under the brand
HERE = os.path.dirname(os.path.abspath(__file__))
NODES = json.load(open(os.environ['LUCIDE_NODES'], encoding='utf-8'))
R2 = 'amb/brand_bonk_golf/inspo-%s.mp4'


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
OPEN, MID, CLOSE = 'Open · 0 to 3s', 'Middle', 'Close'

BRAND = dict(
    display_name='Bonk Golf',
    intro='Bonk hats hold your ball marker on a magnet in the bill and your tees in slots on the side, so '
          'nothing lives in your pockets. Watch a few videos below, pick one, and make your version with your '
          'Bonk hat on a real course.',
    about='Golf hats with a magnetic ball marker built into the bill and tee slots in the side. Snapbacks, '
          'open backs, the PF 2.0 fitted, visors, youth sizes and a Southpaw line for lefties, plus markers, '
          'divot tools, towels and tees.',
    audience='Golfers 25 to 55 who play most weekends and buy their own gear, and the wives, kids and buddies '
             'buying for them from November to Christmas.',
    accent='#2E7D4F',
    logo_url='https://bonkgolf.com/cdn/shop/files/BONK_GOLF_NEW_Logo_1_1_989b507e-bc6e-484f-89c5-873b178547e1.png?width=600',
    submit_platform='TRYBE',
    submit_url=None,
    submit_label='Film this on TRYBE',
    show_inspo=1,
)
CHECKLIST = {
    'do': [
        dict(title='Use it, do not point at it', text='Pop the marker off the bill, mark a ball, pull a tee.'),
        dict(title='Open with the hat moving', text='Hat going on, marker clicking off, a tee sliding out.'),
        dict(title='Real round, real light', text='Phone footage on a course beats a studio every time.'),
    ],
    'say': [
        'The marker sits on a magnet in the bill.',
        'Tees slide into slots on the side of the hat.',
        'Offers and prices: only what is live on bonkgolf.com that day.',
    ],
    'skip': [
        'Holding the hat up and reading out features.',
        'Other hat brands by name, or their logos in shot.',
        '"Patented", "sweat stain resistant", "makes you play better".',
    ],
}
RULES = [
    'Real Bonk hats only, on your head or in your hand. No AI images or AI-made video.',
    'Only hats that are on bonkgolf.com today. Show the tee slots and the magnet where they really are.',
    'Southpaw hats only in videos made for lefties. Youth hats: say "youth size" out loud.',
    'Do not say "patented" or "patent pending" yet. Do not say "sweat stain resistant" about the PF 2.0.',
    'No other hat brands by name and no competitor logos in shot.',
    'Prices and offers only if they are live on the site the day you post.',
]
AVOID = [
    dict(title='The hat held up to the camera with a list of features',
         why='It is the most common creator video in golf and the weakest. Wear it and use it instead.'),
    dict(title='A studio or a bedroom with a ring light',
         why='Our best videos are phone footage outside. A course, a range or a cart beats any set.'),
]
PDF = dict(line1='Bonk creators,', line2="here's what to film.",
           intro="Our creator hub is a board of videos that worked, ours and other brands'. Pick one, make your "
                 'version with your Bonk hat, film it today. Read the short checklist at the bottom first. It '
                 'updates on its own.',
           cta='Your creator hub', note='Opens right on your phone. No login, no app.',
           steps=['Open the hub and pick a video', 'Make your version on the course', 'Send it in'])

HOT = dict(name='Film these first', line='The videos we want most this month.', icon='flame', color='#DC2626')
SECTIONS = [
    dict(key='demo', name='Show it working', icon='magnet', color='#1D4ED8',
         line='The marker on the bill and the tees in the side. Use them on camera, do not just point at them.'),
    dict(key='gifts', name='Gifts', icon='gift', color='#15803D',
         line='Wives, kids and buddies buying for the golfer. Live Nov 1 to Dec 20, so film in October.'),
    dict(key='course', name='On the course', icon='flag', color='#B45309',
         line='A real round, an early tee time, the walk to the first tee.'),
    dict(key='drops', name='New drops', icon='sparkles', color='#BE123C',
         line='Limited hats like the Breakfast Ball. When they are gone, they are gone.'),
]

# One video per idea, in board order. `ad` = our Meta ad, `clip` = (R2 name, brand) for another brand.
# `cap` is the caption on the tile (wins over the title).
IDEAS = [
    dict(sec='demo', hot=True, ad='52555959742213', title="You don't need another hat",
         cap="You don't need another hat. You need one that does something.",
         argument='Most golf hats just sit there. This one holds your marker and your tees, so you stop digging in your pockets.',
         who='The golfer who already owns ten hats', products='Any snapback', format='Talk to camera, then use it',
         visual_hook='Toss an old faded hat out of frame, put the Bonk on in the same second.',
         rehook='At 4 seconds, pull the marker off the bill and drop it behind the ball in one move.',
         openers=["You don't need another golf hat.", 'Watch this before you buy your next hat.', 'I have ten hats. I wear one.'],
         shots=[(OPEN, 'Old hat off, Bonk on. Say the line.'), (MID, 'On the green: marker off the bill, mark, ball up, marker back on.'), (CLOSE, 'Tee out of the side slot on the next tee. "That is the whole point."')]),
    dict(sec='demo', clip=('pa-candy', 'Pins & Aces'), title='Name the design, show the magnet',
         cap='Hat on, hand on the brim, show the marker on the magnet. Name the hat and stop.',
         argument='A close, friendly look at one hat: the design up close, then the marker on the magnet.',
         who='Anyone with a Bonk hat they love', products='One hat, by name', format='Selfie close-up',
         visual_hook='Phone at arm length, tap the logo with one finger in the first second.',
         rehook='Flip the hat over and show the inside, then the bill with the marker on it.',
         openers=['Somebody order a Breakfast Ball?', 'This is the cleanest hat I own.', 'Look at the stitching on this.'],
         shots=[(OPEN, 'Selfie, tap the logo, say its name.'), (MID, 'Turn your head: side tee slots, then the marker on the bill.'), (CLOSE, 'Marker off, marker back on. "Link is below."')]),
    dict(sec='gifts', hot=True, ad='52555960295213', title='Off the couch, onto the course',
         cap='"Sponsor his new hobby." She opens the box, he tries it on in front of his hat wall.',
         argument='A gift that gets him golfing, so everyone wins. Told by the wife, with a smile.',
         who='Wives and girlfriends buying for him', products='Any snapback, or the set', format='Wife voiceover',
         visual_hook='Him asleep on the couch with the remote. She drops the hat on his chest.',
         rehook='Cut to him walking out the door with clubs, hat on. She waves.',
         openers=['I love my husband, but I need the house to myself.', 'Best gift I bought him this year.', 'He has not been on the couch since.'],
         shots=[(OPEN, 'Couch, remote, hat lands on his chest.'), (MID, 'Him trying it on, finding the marker. "Wait, what is this?"'), (CLOSE, 'Out the door with clubs. "Mutually beneficial."')]),
    dict(sec='gifts', clip=('mel-gift', 'Melin'), title='My husband finally tried it',
         cap='Unbox it on the counter, then tell us why he will not take it off.',
         argument='She bought it, he loves it. The gift-giver proving it was a good buy.',
         who='Wives buying for their golfer', products='Any hat, in the box', format='Hands-only unboxing, her voice',
         visual_hook='Box on the counter, hat lifted out in the first second.',
         rehook='Pull the marker off the bill on camera: "this is the part he loves."',
         openers=['I have been trying to get my husband to try this hat for months.', 'He finally wore it. Here is why.', 'Best thing I got him this year.'],
         shots=[(OPEN, 'Box on the counter, hat comes out.'), (MID, 'Marker off the bill, tee into the side slot.'), (CLOSE, '"If he golfs, get him one."')]),
    dict(sec='drops', hot=True, ad='52657915579013', title='The Breakfast Ball drop',
         cap='The donut hat. Show it, show the matching marker, say it will not come back.',
         argument='A limited hat with a story everybody gets (the first-tee mulligan) and a matching marker.',
         who='Golfers who like a fun hat', products='Breakfast Ball snapback and marker', format='Unbox and wear',
         visual_hook='Donut box opens, the hat is inside.',
         rehook='Hit a bad first drive, reach for the Breakfast Ball marker: "taking one."',
         openers=['Everybody gets a breakfast ball.', 'This hat sold out once already.', 'The only donut I eat on the course.'],
         shots=[(OPEN, 'Hat out of a donut box or a bag.'), (MID, 'Matching marker on the bill, close-up.'), (CLOSE, 'First tee, hat on. "Grab one before it is gone."')]),
    dict(sec='demo', clip=('mel-elements', 'Melin'), title='Try to knock the marker off',
         cap='Torture test it. Shake it, jump, swing hard. The marker stays put.',
         argument='Proof the magnet holds: the marker stays on through anything.',
         who='Golfers who think a magnet marker will fall off', products='Any hat', format='Test on camera',
         visual_hook='Shake the hat hard at the camera in the first second, marker still on.',
         rehook='Full driver swing, then lean into the lens: marker still there.',
         openers=['Will the marker fall off? Let us find out.', 'I tried to knock this marker off for a full round.', 'Three swings. One marker.'],
         shots=[(OPEN, 'Shake the hat, flip it upside down.'), (MID, 'Driver swing, jump, cart ride over bumps.'), (CLOSE, 'Close-up: marker exactly where it started.')]),
    dict(sec='demo', ad='52537373911813', title='No gimmicks',
         cap='"Golf gear that actually works." Your pile of hats, then the one with the marker on it.',
         argument='It is not a gimmick: two things that save you time every hole.',
         who='The skeptical golfer', products='Any snapback', format='On-course use',
         visual_hook='Marker clicks onto the bill in a tight close-up.',
         rehook='Pull a tee from the side without looking.',
         openers=['I thought this was a gimmick.', 'No gimmicks. Watch.', 'Two things this hat does.'],
         shots=[(OPEN, 'Marker click, close-up.'), (MID, 'Tee out of the slot on the tee box.'), (CLOSE, 'Swing, walk off.')]),
    dict(sec='course', clip=('ves-japan', 'Vessel'), title='The early tee time POV',
         cap='Film your morning: alarm, coffee, the drive, the first tee. Hat on the whole way.',
         argument='The feeling of an early round, with the hat in every shot.',
         who='Golfers who love a dawn tee time', products='Any hat', format='POV day in the round',
         visual_hook='Dashboard clock at 5:30 and the sun coming up.',
         rehook='Grab the hat off the passenger seat at the course.',
         openers=['Why I wake up at 5am to golf.', 'POV: first tee time of the day.', 'The best part of the week.'],
         shots=[(OPEN, 'Car at dawn, clock on screen.'), (MID, 'Coffee, parking lot, hat on, tee out of the slot.'), (CLOSE, 'First drive into the sunrise.')]),
    dict(sec='course', ad='52531960241413', title='Honestly genius',
         cap='Your honest take over real course footage: "I was impressed. Honestly genius."',
         argument='Everything you need is on your head, so you stay focused on the shot.',
         who='The golfer who takes it seriously', products='Any hat', format='On-course montage',
         visual_hook='Hat pulled down tight, eyes up to the camera.',
         rehook='Marker off and on in one move on the green.',
         openers=['Lock in.', 'Pre-round routine.', 'Nothing in my pockets.'],
         shots=[(OPEN, 'Hat down, look up.'), (MID, 'Tee, swing, green, marker.'), (CLOSE, 'Putt drops.')]),
    dict(sec='demo', clip=('cs-pro', 'Caddy Splash'), title='Stop keeping tees in your pocket',
         cap='Show the problem first: a pocket full of tees and lint. Then the hat.',
         argument='Name the annoying thing every golfer does, then fix it in one move.',
         who='Every golfer with stuffed pockets', products='Any hat', format='Problem then fix',
         visual_hook='Turn your pocket inside out: broken tees, a marker, lint.',
         rehook='Slide three tees into the side of the hat.',
         openers=['Stop keeping tees in your pocket.', 'This is what is in every golfer pocket.', 'Where do you keep your marker?'],
         shots=[(OPEN, 'Pocket inside out.'), (MID, 'Tees into the side slots, marker onto the bill.'), (CLOSE, '"Empty pockets for 18."')]),
    dict(sec='demo', clip=('ves-sound', 'Vessel'), title='The click',
         cap='No talking. Close mic, the marker clicking on and off the magnet.',
         argument='A sound people want to hear twice: the satisfying click of the marker.',
         who='Anyone who watches with the sound on', products='Any hat', format='Sound-only close-ups',
         visual_hook='Silence, then a loud magnet click.',
         rehook='Tee sliding into the slot, close mic.',
         openers=['(no words, just the click)', 'The best sound on the course.', 'Turn your sound on.'],
         shots=[(OPEN, 'Marker click, macro.'), (MID, 'Tee in, tee out.'), (CLOSE, 'Swing sound, ball flight.')]),
    dict(sec='course', clip=('mel-pioneer', 'Melin'), title='This hat became my go-to',
         cap='Sit down, tell us why it is the only hat you grab, then show it on the course.',
         argument='Your honest pick: why this is the one you reach for.',
         who='A golfer talking like a friend', products='Your favourite Bonk hat', format='Talk to camera with cutaways',
         visual_hook='Point at the hat on your head: "this has become my go-to."',
         rehook='Cut to the course mid-sentence.',
         openers=['This hat has become my go-to.', 'I have a pile of hats. I only wear this one.', 'Here is why I stopped wearing my other hats.'],
         shots=[(OPEN, 'At a table, hats in front of you.'), (MID, 'Cutaways: marker, tee, swing.'), (CLOSE, 'Back to the table: "that is why."')]),
    dict(sec='gifts', ad='52652565971613', title='The full set',
         cap='Slow close-ups on a dark table: the logo, the matching marker, the back. Then "before it is gone."',
         argument='One gift with everything a golfer needs, matched.',
         who='Gift buyers', products='A bundle', format='Lay it out',
         visual_hook='Box opens, everything spills onto the table.',
         rehook='Marker from the set clicks onto the hat.',
         openers=['Everything a golfer needs in one box.', 'The easiest golf gift there is.', 'Unboxing the full set.'],
         shots=[(OPEN, 'Box opens.'), (MID, 'Each piece, one second each.'), (CLOSE, 'All of it in use on the course.')]),
    dict(sec='drops', clip=('pri-plaid', 'Primo'), title='You guys asked for it',
         cap='"You asked, it is back." Sit down, say it, cut to it on the course.',
         argument='A restock or a new drop told like news to people who wanted it.',
         who='Followers who missed the last drop', products='A back-in-stock or new hat', format='Talk to camera, then b-roll',
         visual_hook='Hold the hat up beside your face: "you asked for it."',
         rehook='Cut to it on the course.',
         openers=['You guys asked for it.', 'It is back.', 'This sold out last time.'],
         shots=[(OPEN, 'Seated, hat in hand.'), (MID, 'On the course, close-ups.'), (CLOSE, '"Do not wait this time."')]),
    dict(sec='demo', ad='52545471587413', title='Finally, one for lefties',
         cap='Lefties only. Turn the Southpaw slowly so we see the tee slots and the marker.',
         argument='Left-handed golfers finally get a hat made for them.',
         who='Left-handed golfers', products='Southpaw only', format='Talk to camera, then use it',
         visual_hook='Left-handed swing, then point at the hat.',
         rehook='Tee out of the Southpaw side slot.',
         openers=['Lefties, this one is for us.', 'Nobody makes gear for lefties. Bonk did.', 'Finally.'],
         shots=[(OPEN, 'Lefty swing.'), (MID, 'Southpaw slots up close.'), (CLOSE, '"Built for lefties."')]),
    dict(sec='demo', clip=('ves-pocket', 'Vessel'), title='The full review',
         cap='"You asked me to review it." Walk us through every detail on the course.',
         argument='An honest, detailed review from a golfer people trust.',
         who='Golfers who research before they buy', products='Any hat', format='Walk-through review',
         visual_hook='"You guys told me to review this, so I did."',
         rehook='Each detail gets a quick cut: marker, slots, fit, back.',
         openers=['You guys told me to review this hat.', 'Honest review after a month.', 'Everything this hat does.'],
         shots=[(OPEN, 'On the course, hat in hand.'), (MID, 'Detail by detail.'), (CLOSE, '"If you want a hat that does something, this is it."')]),
    dict(sec='course', clip=('hon-switch2', 'Hondo'), title='Wearing it all season',
         cap='Selfie in the cart, one line, show the hat. Ten seconds is enough.',
         argument='A quick, casual flex: the hat you live in.',
         who='Anyone', products='Any hat', format='Selfie in the cart',
         visual_hook='Selfie in the cart, a big line of text on screen.',
         rehook='Take it off, show the bill and the marker, put it back.',
         openers=['Bonk season.', 'This hat every round this fall.', 'Only hat I wear now.'],
         shots=[(OPEN, 'Cart selfie with text.'), (MID, 'Hat off, bill and marker.'), (CLOSE, 'Back on, nod.')]),
]


def build():
    sql = ['-- Bonk Golf creator link seed, 2026-10-16. Run ONCE.']
    b = dict(BRAND)
    cols = ['%s=%s' % (k, q(v)) for k, v in b.items()]
    cols += ['checklist_json=%s' % J(CHECKLIST), 'rules_json=%s' % J(RULES), 'avoid_json=%s' % J(AVOID),
             'pdf_json=%s' % J(PDF), "board_mode='picked'", "updated_at=datetime('now')"]
    sql.append('UPDATE p_amb_brand SET %s WHERE act_id=%s;' % (', '.join(cols), q(ACT)))
    sql.append('DELETE FROM p_amb_proof WHERE act_id=%s;' % q(ACT))
    sql.append('DELETE FROM p_amb_angle WHERE act_id=%s;' % q(ACT))
    sql.append('DELETE FROM p_amb_section WHERE act_id=%s;' % q(ACT))
    hot_id = rid()
    sql.append('INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, pinned, sort) VALUES (%s);'
               % ', '.join(q(x) for x in (hot_id, ACT, HOT['name'], HOT['line'], HOT['icon'], svg(HOT['icon']), HOT['color'], 1, 1, 0)))
    sec = {}
    for i, s in enumerate(SECTIONS, start=1):
        sec[s['key']] = rid()
        sql.append('INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, pinned, sort) VALUES (%s);'
                   % ', '.join(q(x) for x in (sec[s['key']], ACT, s['name'], s['line'], s['icon'], svg(s['icon']), s['color'], 1, 0, i)))
    hot_sort = 0
    for i, a in enumerate(IDEAS, start=1):
        aid = rid()
        if a.get('hot'):
            hot_sort += 1
        shots = [dict(label=l, text=t) for l, t in a['shots']]
        inspo = [dict(brand=a['clip'][1], what=a['cap'], url=None)] if a.get('clip') else []
        sql.append('INSERT INTO p_amb_angle (id, act_id, section_id, hot, hot_sort, sort, status, title, argument, who, products, format, '
                   'openers_json, shots_json, visual_hook, rehook, inspo_json) VALUES (%s);'
                   % ', '.join([q(aid), q(ACT), q(sec[a['sec']]), q(1 if a.get('hot') else 0), q(hot_sort if a.get('hot') else 0), q(i),
                                q('live'), q(a['title']), q(a['argument']), q(a['who']), q(a['products']), q(a['format']),
                                J(a['openers']), J(shots), q(a['visual_hook']), q(a['rehook']), J(inspo)]))
        if a.get('ad'):
            # Only an ad Bonk's Meta account really has (the join guards a typo).
            sql.append("INSERT INTO p_amb_proof (id, act_id, angle_id, kind, ad_id, note, section_id, shown, sort, board_sort) "
                       "SELECT %s, %s, %s, 'meta', %s, %s, %s, 1, 1, %d WHERE EXISTS (SELECT 1 FROM ads WHERE act_id=%s AND ad_id=%s);"
                       % (q(rid()), q(ACT), q(aid), q(a['ad']), q(a['cap']), q(sec[a['sec']]), i, q(META_ACT), q(a['ad'])))
        else:
            name, who = a['clip']
            sql.append("INSERT INTO p_amb_proof (id, act_id, angle_id, kind, file_key, who, note, section_id, shown, sort, board_sort) VALUES (%s);"
                       % ', '.join(q(x) for x in (rid(), ACT, aid, 'upload', R2 % name, '%s (inspiration)' % who, a['cap'], sec[a['sec']], 1, 1, i)))
    text = '\n'.join(sql)
    assert '—' not in text and '–' not in text, 'em or en dash found'
    open(os.path.join(HERE, 'seed_bonk_golf.sql'), 'w', encoding='utf-8').write(text + '\n')
    print('wrote seed_bonk_golf.sql:', len(SECTIONS), 'sections,', len(IDEAS), 'ideas,', hot_sort, 'hot')


if __name__ == '__main__':
    build()
