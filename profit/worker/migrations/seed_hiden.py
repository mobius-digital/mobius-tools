"""One-time seed: HIDEN's creator link (Ambassadors), drafted 2026-10-02.

Writes seed_hiden.sql, which is run ONCE against the shared D1:
  npx wrangler d1 execute mobius-account-health --remote --file migrations/seed_hiden.sql
Needs LUCIDE_NODES = path to lucide-static@1.46.0/icon-nodes.json and HIDEN_ACT = the brand's
act_id in Locus. HIDEN has no Meta account in Locus yet (2026-10-02), so this script refuses to
run without HIDEN_ACT; add the brand first (Settings > + New client, or + Add a brand).
Sources: docs/angles-hiden.md (hiden.com, Chris Beauchamp's brief and mockups, Atria competitors,
forum and review voice of customer). No HIDEN ads exist, so no angle carries proof.
The link is seeded OFF (live = 0) for Cole's review. Re-running it replaces HIDEN's sections,
angles and proof, so do not run it again once the team has edited the page.
"""
import json, os, secrets, sys

ACT = os.environ.get('HIDEN_ACT', '').strip()
if not ACT.startswith('act_'):
    sys.exit('Set HIDEN_ACT to HIDEN\'s act_id in Locus first (the brand has no Meta account in Locus yet).')
HERE = os.path.dirname(os.path.abspath(__file__))
NODES = json.load(open(os.environ['LUCIDE_NODES'], encoding='utf-8'))

def svg(name):
    return ''.join('<%s%s/>' % (t, ''.join(' %s="%s"' % (k, v) for k, v in a.items())) for t, a in NODES[name])

def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

rid = lambda: secrets.token_hex(8)
OPEN, MID, CLOSE = 'Open · 0 to 3s', 'Middle', 'Close'

# Drawn season shape, 0-100 per ISO week (25 = a normal week). No sales history exists, so this is
# the shape of the category: first cold snap and deer season from October, gifting peak in
# December, a late-winter bump, Father's Day in June, quiet summer.
CUSTOM = {1: 30, 2: 28, 3: 26, 4: 24, 5: 24, 6: 24, 7: 24, 8: 22, 9: 20, 10: 18, 11: 18, 12: 18,
          13: 16, 14: 16, 15: 16, 16: 16, 17: 16, 18: 16, 19: 16, 20: 18, 21: 20, 22: 24, 23: 30,
          24: 36, 25: 20, 26: 14, 27: 12, 28: 12, 29: 12, 30: 12, 31: 12, 32: 14, 33: 16, 34: 20,
          35: 24, 36: 28, 37: 30, 38: 32, 39: 36, 40: 40, 41: 44, 42: 46, 43: 48, 44: 50, 45: 56,
          46: 64, 47: 72, 48: 100, 49: 90, 50: 84, 51: 76, 52: 40, 53: 30}

brand = dict(
    slug='hiden', live=0, display_name='HIDEN', accent='#E8401C', logo_url=None,
    intro=("HIDEN makes clothes with two sides: normal on one, country on the other. You pick which one shows, "
           "and you can change your mind at the truck door. We want videos that look like your real week: the office, "
           "the school run, the lease, the tailgate, dinner with her parents. Pick an idea below, film it your way, "
           "and submit it on TRYBE."),
    about=("Reversible everyday apparel from a real hunting brand. Black on one side, camo or the HIDEN print on the "
           "other, for men and women. The puffer leads; hoodies, vests and a women's collection follow. Hidden details: "
           "a sunglasses-cleaning swatch sewn into the pocket, a chapstick pocket, a HIDEN keychain koozie, and a QR code "
           "on the tag that plays how your piece was made."),
    audience=("People who are country at heart and live a normal week: office jobs, school runs, date nights, with a "
              "lease, a boat or a tailgate on the weekend. From November we also talk to the wives, girlfriends and "
              "mums buying for him. The women's collection talks to the country-concert and tailgate crowd."),
    submit_platform='TRYBE',
    submit_url=None, submit_label='Film this on TRYBE',
    avoid=[
        dict(title='Saying "reversible" or "two looks, one jacket" before you show it',
             why='Every outdoor brand says it. Flip the jacket on camera in the first three seconds instead; the flip is the whole idea.'),
        dict(title='Holding the jacket up on a hanger and listing features',
             why='A jacket on a hanger sells nothing. Wear it, flip it, go somewhere.'),
        dict(title='A talking-head review in your kitchen',
             why='We will get plenty. Take us to the two places the jacket lives: your normal day and your country one.'),
        dict(title='Making fun of city people or country people',
             why='The joke is that you are both. Nobody is the punchline.'),
        dict(title='Politics, "redneck", anything that picks a side',
             why='Camo already reads that way to some people. We are warm and funny about both sides of the jacket.'),
        dict(title='Claiming it is warmer, waterproof or scent-blocking',
             why='That is our hunt line\'s job. This jacket sells on the flip and the details.'),
    ],
    rules=[
        'Flip the jacket on camera inside the first three seconds of every video. One move, no cut.',
        'You can say: "made by a hunting brand", "two sides", "black side", "camo side", "there is a chapstick pocket", "there is a swatch to clean your sunglasses", "scan the tag to see how it was made".',
        'Don\'t say "reversible" or "two looks, one jacket" as your opener. Show it, then say it if you want.',
        'Don\'t quote prices, discounts, a review count or a sales number. Only mention an offer that is live on the site the day you post.',
        'Don\'t say "sustainable" or "ethical". If you scan the tag, describe what you saw, not what it proves.',
        'Show the camo side worn in at least one real place: the lease, the boat, the tailgate, the bonfire.',
        'Show the black side worn in at least one normal place: the office, the school run, dinner.',
        'If your partner is in it, they are in on the joke, never the nag.',
        'Film vertical, sound on, and show the jacket in the first second.',
        'Only film people who agreed to be in your video. If there is alcohol on screen, everyone is 21 or older. No weapons in frame.',
    ],
    season=dict(
        title='Deer season, tailgates and gift season', until='Dec 20',
        line=("The first cold snap, opening day and tailgate Saturdays are here, and gift shopping starts in early "
              "November. Film your gift videos in October so they are ready for the holiday push."),
        next='Late winter cold and Father\'s Day, from January',
        highlight=['10-01', '12-20'], show_chart=True, color='#E8401C', cap=None,
        mode='custom', custom={str(k): v for k, v in CUSTOM.items()},
    ),
    pdf=dict(
        line1='HIDEN creators,',
        line2="here's what to film.",
        intro=("Our creator hub has every idea we want right now: this week's hot picks, the season, gift videos, "
               "openers you can say word for word, and the videos that worked. It updates on its own, so check it "
               "before you shoot."),
        cta='Your creator hub',
        note='Opens right on your phone. No login, no app.',
        steps=['Open the hub and pick an idea',
               'Film it in your real week, starting with the flip',
               "Submit on TRYBE with the idea's name"],
    ),
    show_inspo=1,
)

SECTIONS = [
    dict(key='hot', name='Hot right now', line='What we are pushing hardest this week', icon='flame', color='#DC2626', pinned=1),
    dict(key='ev', name='Always works', line='Ideas that sell any month of the year.', icon='sparkles', color='#334155'),
    dict(key='season', name='This season', line='Deer season, tailgates and the gift window. Oct 1 to Dec 20.', icon='leaf', color='#B45309'),
    dict(key='haute', name='Haute and Hiden', line='The women\'s collection: concerts, rodeos, tailgates. Switch on when samples exist.', icon='gem', color='#7C3AED', enabled=0),
    dict(key='hunt', name='Made by hunters', line='Our hunters vouch for the flip. Real stands, real camo.', icon='trees', color='#15803D'),
    dict(key='story', name='The story', line='The QR code on the tag plays how your piece was made.', icon='qr-code', color='#1D4ED8'),
]

PUFFER = 'Reversible puffer (men\'s or women\'s)'
ANY = 'Any HIDEN reversible piece'

def A(sec, title, fmt, argument, who, openers, shots, on_screen=None, do=None, dont=None, lever=None,
      products=PUFFER, hot=0, trend=None, ads=(), status='live'):
    return dict(sec=sec, title=title, format=fmt, argument=argument, who=who, openers=openers,
                shots=[dict(label=l, text=t) for l, t in shots], on_screen=on_screen, do=do, dont=dont,
                lever=lever, products=products, hot=hot, trend=trend, ads=list(ads), status=status)

ANGLES = [
    # ---------------- Hot right now ----------------
    A('hot', 'The flip', 'One take',
      'One jacket does your whole day. Black for the office, camo for the lease, and you flip it at the truck door.',
      'The guy who is in a meeting at two and a deer stand at five.',
      ['Watch what happens to this jacket when I leave the office.',
       'Normal for now. Give it about four seconds.',
       'Same jacket. Two very different afternoons.'],
      [(OPEN, 'Start in the normal place: parking lot, office door, driveway. Black side out.'),
       (MID, 'Flip it on camera in one move. Don\'t cut. Let us see the camo come out.'),
       (CLOSE, 'Walk into the country side of your day. One line about where you\'re headed.')],
      on_screen='Normal for now. Country whenever.',
      do='Keep the flip in one continuous take. The reveal is the ad.',
      dont='Explain what reversible means. Show it.',
      lever='Identity', hot=1),
    A('hot', 'She said no camo at dinner', 'Skit',
      'Every couple has had the "you are not wearing that" conversation. This jacket ends it.',
      'Couples. He wears camo everywhere; she has rules about where.',
      ['She said no camo at her parents\' place. So I flipped it.',
       '"You\'re not wearing that." Okay. Watch this.',
       'Compromise, in one jacket.'],
      [(OPEN, 'Film the look she gives you at the door. Let her say the line in her own words.'),
       (MID, 'Flip it right there in front of her. Keep her reaction in.'),
       (CLOSE, 'Her verdict on camera. Then, later, the camo side back out when she\'s not looking.')],
      on_screen='No camo at dinner. Fine.',
      do='Let her be funny. She is in on the joke.',
      dont='Make her the nag or him the idiot. Both of them win.',
      lever='Humor', hot=1),
    A('hot', 'Things you find after you buy it', 'Fast cuts',
      'The jacket has secrets: a swatch to clean your sunglasses, a chapstick pocket, a koozie on the keys, and a whole other side.',
      'Anyone who likes a jacket with more going on than it shows.',
      ['It took me a week to find everything in this jacket.',
       'There\'s a thing in here to clean your sunglasses. Who does that?',
       'Chapstick pocket. Koozie on the keys. And that\'s before you flip it.'],
      [(OPEN, 'Find one detail on camera like you didn\'t know it was there. Use it: wipe the sunglasses.'),
       (MID, 'Fast cuts, one detail per cut: chapstick out of the pocket, koozie clipped on, the tag.'),
       (CLOSE, 'End on the flip, like the biggest secret was the whole other side.')],
      on_screen='More than meets the eye',
      do='Actually use each detail. Wipe the glasses, open the chapstick.',
      dont='List them in a caption. Show them.',
      lever='Proof', hot=1),
    A('hot', 'He does not need another hoodie', 'Voiceover',
      'Every December he gets another hoodie. This year he gets two jackets in one, and she likes him in both.',
      'Wives, girlfriends and mums buying for a guy who owns camo and a job. Turn Hot in November.',
      ['Every year he gets a hoodie. This year he\'s getting two jackets in one.',
       'If your husband owns camo and a job, this is the gift.',
       'I got him this so he\'d stop wearing the other thing to dinner.'],
      [(OPEN, 'Talk to the camera like you\'re telling a friend what you\'re getting him.'),
       (MID, 'Show him opening it and flipping it. His reaction is the ad.'),
       (CLOSE, 'One line on where he wore it that week.')],
      on_screen='Two looks. One gift.',
      do='Film his real reaction. Keep the camera on his face.',
      dont='Quote a price or a discount.',
      lever='Gifting', hot=1),

    # ---------------- Always works ----------------
    A('ev', 'Unboxing, no gushing', 'Unboxing',
      'Open the box, pull it out black side first, flip it, and be picky about the pockets and the zipper.',
      'Day one. Every ambassador gets a box.',
      ['It came. Let\'s see if the camo side is real.',
       'Opening a jacket that\'s supposedly two jackets. I\'ve got questions.',
       'First look, no filter. Then I\'m flipping it.'],
      [(OPEN, 'Open the box, pull it out black side first, say your honest first impression.'),
       (MID, 'Flip it. Show the seams, the pockets on both sides, the zipper. Be picky.'),
       (CLOSE, 'Put it on and say which side you\'d wear today.')],
      on_screen='First look',
      do='Check the pockets on both sides on camera. People worry about that with reversibles.',
      dont='Spend the first seconds on the lid.',
      lever='Proof'),
    A('ev', 'One jacket, one whole day', 'Day in the life',
      'One jacket, six places, flipped every time the setting changes.',
      'The person whose Saturday goes from a kid\'s game to a bonfire.',
      ['One jacket. Six places. Let\'s go.',
       'Soccer game, Lowe\'s, the lease, dinner. Same jacket, different side.',
       'Counting how many times I flip this thing today.'],
      [(OPEN, 'Clip at the first stop, two seconds. Say where you are.'),
       (MID, 'Flip it on camera every time the setting changes. Put a count on screen.'),
       (CLOSE, 'End with the total and which side won the day.')],
      on_screen='Flips today: 4',
      do='Keep a running count on screen.',
      lever='Identity'),
    A('ev', 'My buddies when the camo came out', 'Reaction',
      'Show up in a plain black jacket, flip it, and film the table.',
      'Anyone whose friends have opinions.',
      ['Showed up in a plain black jacket. Then I flipped it. Listen to these guys.',
       'My buddy called it a gimmick. Then he asked where I got it.',
       'Sound on. Watch the table when this thing turns inside out.'],
      [(OPEN, 'Start recording before the flip, with your group in frame.'),
       (MID, 'Flip it and keep the camera on them, not you.'),
       (CLOSE, 'Get the loudest one\'s verdict. Then let him try it on.')],
      on_screen='Wait for it',
      do='Keep the reaction real. One take, no script for your buddies.',
      lever='Status'),
    A('ev', 'Thirty days in', 'Update',
      'A month in, say which side you actually wear, what bugs you, and whether it stays.',
      'Every ambassador, a month after the box shows up. The second video from one piece.',
      ['Thirty days with the flip jacket. Honest update.',
       'Which side I actually wear, a month in.',
       'What I like, what bugs me, and whether I\'d buy it.'],
      [(OPEN, 'Show it after a month, marks and all. Say how many days it\'s been worn.'),
       (MID, 'Say which side got more days and why. One thing that annoyed you.'),
       (CLOSE, 'Say whether it stays in the rotation.')],
      on_screen='30 days in',
      do='Be honest about which side wins. That is more believable than pretending.',
      lever='Proof', products=ANY),
    A('ev', 'Which side are you', 'Question',
      'A question, not a pitch: black side or camo side on a Tuesday?',
      'The comment section.',
      ['Black side or camo side. Which one are you on a Tuesday?',
       'Be honest. Which side would you wear to work?',
       'My wife says black. I say camo. Settle it.'],
      [(OPEN, 'Hold up both sides, flip once, ask the question straight to camera.'),
       (MID, 'Show each side worn for two seconds.'),
       (CLOSE, 'Say which one you are and tell people to argue in the comments.')],
      on_screen='Black side or camo side?',
      do='Ask it like you actually want the answer.',
      lever='Belonging'),

    # ---------------- This season ----------------
    A('season', 'Opening day, straight from work', 'One take',
      'Leave the office at noon, flip it in the truck, and you are at the gate without changing.',
      'The guy who takes a half day on opening day.',
      ['Left the office at noon. Didn\'t change jackets. Here\'s how.',
       'Opening day. Flipped it in the truck. Let\'s go.',
       'Nobody at work knows what the inside of this jacket looks like.'],
      [(OPEN, 'Clip the office or the parking lot, black side out.'),
       (MID, 'Flip it in the truck. Show the drive, the gate, the stand.'),
       (CLOSE, 'One line at the end about how the afternoon went.')],
      on_screen='Opening day, straight from work',
      dont='Show a weapon in frame.',
      lever='Identity', hot=0),
    A('season', 'The gift I\'d actually want', 'Voiceover',
      'The ask comes from him, not the brand: if somebody asks what to get you, send them this.',
      'The guy whose family asks every year and gets socks.',
      ['If somebody asks what to get you this year, send them this.',
       'Please stop buying me socks. Buy me this.',
       'My wife asked what I wanted. I flipped the jacket and said "this, both sides."'],
      [(OPEN, 'Talk to camera like it\'s your family asking.'),
       (MID, 'Flip it once so they get it. Show a detail or two.'),
       (CLOSE, 'Say where to find it. Done.')],
      on_screen='Send this to whoever asks',
      do='Pair with "He does not need another hoodie" so both sides of the gift are covered.',
      lever='Gifting'),
    A('season', 'Tailgate to the game', 'Transition',
      'Camo for the tailgate, black for the bar, and you never went home to change.',
      'Anyone whose Saturday is a parking lot, then a stadium, then a bar.',
      ['Camo for the tailgate, black for the bar. One jacket.',
       'Three places, one Saturday, and I never went home to change.',
       'This jacket has a tailgate side.'],
      [(OPEN, 'Tailgate clip, camo out, cooler in frame. Koozie on the keys if you\'ve got it.'),
       (MID, 'Flip it walking in. Show the black side in the stands or at the bar.'),
       (CLOSE, 'One line: never went home to change.')],
      on_screen='Never went home to change',
      do='Everyone on screen with a drink is 21 or older.',
      lever='Belonging', products='Reversible puffer or hoodie'),

    # ---------------- Haute and Hiden (off until samples and legal) ----------------
    A('haute', 'Work fit, concert fit, same jacket', 'GRWM',
      'Nine to five on one side, the show on the other, and she never changed jackets.',
      'The woman with a concert on Friday and a job on Friday morning.',
      ['Get ready with me for work. Then watch me get ready for the show without changing jackets.',
       'Nine to five on one side. The show on the other.',
       'I have one jacket for the office and the concert and it\'s the same jacket.'],
      [(OPEN, 'Morning: black side, the work outfit, out the door.'),
       (MID, 'Evening: flip it on camera, boots on, show the print side with the night outfit.'),
       (CLOSE, 'One line about which side got more compliments.')],
      on_screen='Work fit. Concert fit. Same jacket.',
      lever='Identity', products='Women\'s reversible puffer', status='draft'),
    A('haute', 'The set', 'Try-on',
      'A matching set with two sides is four outfits, and she will be living in it all winter.',
      'The matching-set buyer who already owns four sets.',
      ['I have zero self-control and this set has two sides, so that\'s four outfits.',
       'Camo side for the bonfire. Print side for the airport. Same set.',
       'I will be living in this all winter. Both sides.'],
      [(OPEN, 'Try on the first side, say how it feels. Pockets, cuffs, the hood.'),
       (MID, 'Flip the top and the bottoms on camera. Show the second side worn.'),
       (CLOSE, 'Say which side you\'re wearing out the door today.')],
      on_screen='Four outfits. One set.',
      lever='Value', products='Reversible sweat set or jumpsuit', status='draft'),
    A('haute', 'Not pink. Not boxy. Mine.', 'Try-on',
      'Camo cut for a woman: the waist, the sleeves, the hood, on both sides.',
      'The woman who has been handed a men\'s small with a pink zipper one too many times.',
      ['Finally, camo that isn\'t a men\'s small with a pink zipper.',
       'They cut this for a woman. You can tell at the waist.',
       'Camo side, black side, and it actually fits. Watch.'],
      [(OPEN, 'Show the fit on both sides: waist, sleeves, hood. Turn around.'),
       (MID, 'Flip it and show it still fits on the other side.'),
       (CLOSE, 'Say what you usually have to settle for.')],
      on_screen='Cut for her. Both sides.',
      dont='Call anything pink or cute. That is the thing she is sick of.',
      lever='Relief', products='Women\'s reversible puffer', status='draft'),

    # ---------------- Made by hunters ----------------
    A('hunt', 'We make hunt gear. This is the rest of the week.', 'Transition',
      'A real hunter in HIDEN hunt gear in the stand, then the same person in town in the reversible.',
      'HIDEN\'s current hunters, and anyone who worries a camo fashion brand is a costume.',
      ['I\'ve hunted in HIDEN for three seasons. This is what they made for the other six days.',
       'Same camo I wear in the stand. Now it\'s got a side I can wear to work.',
       'This isn\'t a fashion brand that found camo. It\'s a hunting brand that found Monday.'],
      [(OPEN, 'Show your HIDEN hunt gear, worn, in the field.'),
       (MID, 'Cut to town: same person, the reversible, black side out. Flip it.'),
       (CLOSE, 'Say why it matters that the same brand made both.')],
      on_screen='Made by hunters',
      do='Only film this if you actually hunt in HIDEN gear.',
      dont='Show a weapon in frame.',
      lever='Proof', products='Reversible puffer plus your HIDEN hunt gear'),
    A('hunt', 'Is the camo real', 'Test',
      'Flip to camo, walk into the tree line, and let the pattern prove itself.',
      'The skeptic who assumes a lifestyle camo is a print, not a pattern.',
      ['Is this fashion camo or real camo? Let\'s go stand in the woods and find out.',
       'Flipped it to the camo side and walked into the tree line. Can you see me?',
       'Same pattern as their hunt line. I checked.'],
      [(OPEN, 'Flip to camo on camera at the edge of the woods.'),
       (MID, 'Walk in, have someone film from twenty yards. Let it blend.'),
       (CLOSE, 'Walk out, flip back to black, say what you think.')],
      on_screen='Can you see me?',
      do='Confirm with the brand that the reversible uses the real Exile pattern before filming this.',
      lever='Proof'),

    # ---------------- The story ----------------
    A('story', 'Scan the tag', 'Screen record',
      'The QR code on the tag plays how the piece was made, farm to finished jacket.',
      'The buyer who wants to know who made it. Best for people who already know the brand.',
      ['There\'s a QR code on the tag. I scanned it. Did not expect this.',
       'This jacket has a whole movie about where it came from.',
       'Scan the tag. Meet the people who made it.'],
      [(OPEN, 'Find the tag, scan it on camera, show the phone.'),
       (MID, 'Screen-record ten seconds of the story: the farm, the sewing.'),
       (CLOSE, 'Say one thing you learned. Then flip the jacket.')],
      on_screen='Scan the tag',
      dont='Say "sustainable" or "ethical". Describe what you saw.',
      lever='Proof', products=ANY),
    A('story', 'Good clothes do good things', 'Voiceover',
      'Part of every piece goes somewhere. Show the receipt.',
      'The buyer who picks the brand that gives back. Only once the program is real and documented.',
      ['Here\'s where part of this jacket went.',
       'I bought a jacket. Somebody else got something they needed.',
       'Good clothes do good things. Here\'s the receipt.'],
      [(OPEN, 'Show the piece and say what the brand does with part of the sale.'),
       (MID, 'Show it: the delivery, the drive, the people, whatever HIDEN can document.'),
       (CLOSE, 'Flip the jacket. One line.')],
      on_screen='Good clothes do good things',
      do='Film only what the brand can show you really happened.',
      lever='Belonging', products=ANY, status='draft'),
]

sql = ["-- HIDEN creator link seed (see seed_hiden.py)",
       f"DELETE FROM p_amb_proof WHERE act_id = {q(ACT)};",
       f"DELETE FROM p_amb_angle WHERE act_id = {q(ACT)};",
       f"DELETE FROM p_amb_section WHERE act_id = {q(ACT)};",
       f"DELETE FROM p_amb_brand WHERE act_id = {q(ACT)};"]
b = brand
sql.append(
    "INSERT INTO p_amb_brand (act_id, slug, live, display_name, intro, about, audience, accent, logo_url, "
    "submit_platform, submit_url, submit_label, avoid_json, rules_json, season_json, show_inspo, pdf_json) VALUES (" +
    ', '.join(q(x) for x in [ACT, b['slug'], b['live'], b['display_name'], b['intro'], b['about'], b['audience'],
                             b['accent'], b['logo_url'], b['submit_platform'], b['submit_url'], b['submit_label'],
                             json.dumps(b['avoid']), json.dumps(b['rules']), json.dumps(b['season']), b['show_inspo'],
                             json.dumps(b['pdf'])]) + ");")
sec_id = {}
for i, s in enumerate(SECTIONS):
    sid = rid(); sec_id[s['key']] = sid
    sql.append("INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, pinned, sort) VALUES (" +
               ', '.join(q(x) for x in [sid, ACT, s['name'], s['line'], s['icon'], svg(s['icon']), s['color'],
                                        s.get('enabled', 1), s.get('pinned', 0), i]) + ");")
hot_n = 0
sort_by_sec = {}
for a in ANGLES:
    aid = rid()
    sort_by_sec[a['sec']] = sort_by_sec.get(a['sec'], 0) + 1
    if a['hot']:
        hot_n += 1
    sql.append("INSERT INTO p_amb_angle (id, act_id, section_id, hot, hot_sort, sort, status, title, argument, who, products, "
               "format, lever, openers_json, shots_json, on_screen, do_text, dont_text, trend) VALUES (" +
               ', '.join(q(x) for x in [aid, ACT, sec_id[a['sec']], a['hot'], hot_n if a['hot'] else 0, sort_by_sec[a['sec']],
                                        a['status'], a['title'], a['argument'], a['who'], a['products'], a['format'], a['lever'],
                                        json.dumps(a['openers']), json.dumps(a['shots']), a['on_screen'], a['do'], a['dont'],
                                        a['trend']]) + ");")
    for k, ad in enumerate(a['ads']):
        sql.append("INSERT INTO p_amb_proof (id, act_id, angle_id, kind, ad_id, shown, sort) VALUES (" +
                   ', '.join(q(x) for x in [rid(), ACT, aid, 'meta', ad, 1, k + 1]) + ");")

open(os.path.join(HERE, 'seed_hiden.sql'), 'w', encoding='utf-8').write('\n'.join(sql) + '\n')
print(len(ANGLES), 'angles,', len(SECTIONS), 'sections,', sum(len(a['ads']) for a in ANGLES), 'tagged ads')
