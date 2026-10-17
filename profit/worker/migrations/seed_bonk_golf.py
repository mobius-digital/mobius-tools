"""One-time seed: Bonk Golf's creator link (Ambassadors), built 2026-10-16.

Writes seed_bonk_golf.sql, run ONCE against the shared D1:
  npx wrangler d1 execute mobius-account-health --remote --file migrations/seed_bonk_golf.sql
Needs LUCIDE_NODES = path to lucide-static@1.46.0/icon-nodes.json.

Bonk is not on TRYBE yet (Cole, 2026-10-16), so the submit link is left empty: the page hides the
button until a campaign link is pasted on the Ambassadors tab. The board is hand-picked, one video
per idea, in the order below (board_sort):
  - OUR videos: Bonk's own Meta video ads that sold AND that a creator can copy (Cole, 2026-10-16: no motion
    graphics, studio spins or CGI). Kept: 236 B 1.57x. Also pulled by Cole: 246 C, 224 A. Pulled for that reason: 243 A, 285-1,
    280 C, 239 A, 278 B, 276 B (and Melin's CGI dirt test, Primo's "$5000 camera" brand film).
  - OTHER BRANDS' videos: Atria clips stored in R2 at amb/brand_bonk_golf/inspo-<name>.mp4 (uploaded by
    hand), shown as "<brand>, not us". Melin, Vessel, Primo (Cole's picks) plus Pins & Aces (a hat with a
    magnet marker), Hondo and Caddy Splash. The format is what we copy; the product can be anything (a
    jogger or a hoodie ad is fine if a creator can film the same shape with a Bonk hat).
    Research: docs/research-2026-10-16/bonk-golf.md.
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
    accent='#121212',   # bonkgolf.com theme text colour (site is black and white)
    # Bonk's own logo file has a solid white box; angles/logos/bonk-golf.png is the same logo with it removed.
    logo_url='https://tools.go-mobius-digital.com/angles/logos/bonk-golf.png',
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
    dict(sec='gifts', hot=True, clip=('bb-prank', 'Bogey Bros'), title='How long until he notices',
         cap='"I got my husband a hat. Let us see how long it takes him to notice the marker." Film his reaction.',
         argument='A gift prank: he thinks it is a normal hat until he finds the magnet marker.',
         who='Wives and girlfriends', products='Any hat', format='Gift reaction',
         visual_hook='You whisper to the camera while he is in the next room.',
         rehook='"Wait, what is this?" when he finds the marker.',
         openers=['I got my husband a golf hat. Let us see how long it takes him to notice.', 'He has no idea what this hat does yet.', 'Watch his face.'],
         shots=[(OPEN, 'Whisper the plan, hat in hand.'), (MID, 'Hand it over: "nice, a hat." Then he finds the marker.'), (CLOSE, '"Took you long enough."')]),
    dict(sec='demo', hot=True, clip=('pa-candy', 'Pins & Aces'), title='Name the design, show the magnet',
         cap='Hat on, hand on the brim, show the marker on the magnet. Name the hat and stop.',
         argument='A close, friendly look at one hat: the design up close, then the marker on the magnet.',
         who='Anyone with a Bonk hat they love', products='One hat, by name', format='Selfie close-up',
         visual_hook='Phone at arm length, tap the logo with one finger in the first second.',
         rehook='Flip the hat over and show the inside, then the bill with the marker on it.',
         openers=['Somebody order a Breakfast Ball?', 'This is the cleanest hat I own.', 'Look at the stitching on this.'],
         shots=[(OPEN, 'Selfie, tap the logo, say its name.'), (MID, 'Turn your head: side tee slots, then the marker on the bill.'), (CLOSE, 'Marker off, marker back on. "Link is below."')]),
    dict(sec='course', hot=True, clip=('mel-pilot', 'Melin'), title='One hat, my whole day',
         cap='"I used to pack five hats." Film your day: work, the course, dinner. Same Bonk hat in every shot.',
         argument='One hat that does the whole day, so you stop owning a hat for everything.',
         who='Golfers with a job, a family and a tee time', products='Any snapback', format='Day in the life, talk over it',
         visual_hook='The hat sitting on your dashboard or desk, then you grab it.',
         rehook='Hard cut from work clothes to the first tee, same hat.',
         openers=['I used to own a hat for everything.', 'One hat. My whole day.', 'Work, golf, dinner. Same hat.'],
         shots=[(OPEN, 'Hat on the dash or desk, grab it.'), (MID, 'Work, then the course: marker off the bill on the green.'), (CLOSE, 'Dinner or the bar, hat still on. "Just this one."')]),
    dict(sec='course', clip=('bbird-range', 'Bad Birdie'), title='Straight from the box to the range',
         cap='Open the box, then hard cut to you hitting balls at the range in the hat. "Taking my new hat to the range."',
         argument='Unboxing that goes somewhere real, so the hat is seen working within seconds.',
         who='Any golfer', products='A new hat', format='Unbox, then the range',
         visual_hook='Hands tearing the box open, text on screen: "taking my new hat to the range".',
         rehook='Hard cut from the box to a swing.',
         openers=['Taking my new hat to the range.', 'It just showed up. Let us test it.', 'Box to bucket of balls.'],
         shots=[(OPEN, 'Box opens on a table.'), (MID, 'Range: tees out of the side slots, swings.'), (CLOSE, 'Marker off the bill on the practice green.')]),
    dict(sec='demo', clip=('anson-rant', 'Anson Belt'), title='The rant, then "then I found this"',
         cap='Rant about the problem first: tees in your pocket, the marker you always lose. Then "then I found this."',
         argument='A real complaint every golfer has, said out loud, then the fix.',
         who='Golfers with something to complain about', products='Any hat', format='Rant, then the fix',
         visual_hook='Start mid-rant, pointing at the camera.',
         rehook='"Then I found this," and you pull the marker off the bill.',
         openers=['The more I golf, the more ball markers I lose.', 'Can we talk about golf pockets for a second?', 'Here is my problem with golf hats.'],
         shots=[(OPEN, 'Mid-rant, outside.'), (MID, '"Then I found this": marker off, tee out.'), (CLOSE, '"Problem solved."')]),
    dict(sec='gifts', clip=('wb-guess', 'Waterboy'), title='Guess what the hat does',
         cap='Two people, a game: one holds the hat up, the other guesses what it does. The answers get the laughs.',
         argument='A game makes people watch to the end, and the hat is the answer.',
         who='Couples, buddies, a parent and kid', products='Any hat', format='Two-person guessing game',
         visual_hook='Text on screen: "Guess what this hat does".',
         rehook='The marker comes off the bill on the right answer.',
         openers=['Guess what this hat does.', 'My wife has to guess what makes this hat different.', 'You get three guesses.'],
         shots=[(OPEN, 'Hat held up, the challenge.'), (MID, 'Wrong guesses, then the marker comes off.'), (CLOSE, 'Tee slots as the bonus round.')]),
    dict(sec='drops', clip=('pri-story', 'Primo'), title='I just had to come on here quick',
         cap='Story-style selfie: "I had to come on here quick, this just dropped." Show it, point at the link.',
         argument='News from a person, not an ad: a new hat just dropped and you love it.',
         who='Creators who post stories', products='The newest hat or colour', format='Story selfie',
         visual_hook='Phone up close, "I just had to come on here quick."',
         rehook='Take the hat off and show the marker on the bill to the camera.',
         openers=['I just had to come on here quick.', 'This literally just dropped.', 'OK, you need to see this hat.'],
         shots=[(OPEN, 'Story selfie, hat on.'), (MID, 'Hat off, close on the marker and slots.'), (CLOSE, 'Point down: "link is right here."')]),
    dict(sec='course', clip=('bbird-2holes', 'Bad Birdie'), title='Play 2 holes with me',
         cap='"Play 2 holes with me." Tee box intro, then every shot, hat on, marker on the green.',
         argument='An invitation to tag along for a couple of holes, with the hat in every shot.',
         who='Creators who film their rounds', products='Any hat', format='Play a couple holes with me',
         visual_hook='You on the tee with a driver, text "Play 2 holes with me".',
         rehook='Show the score on screen each hole.',
         openers=['Play 2 holes with me.', 'Come play the back nine with me.', 'Two holes, one hat.'],
         shots=[(OPEN, 'On the tee, say the line.'), (MID, 'Each shot, quick cuts, marker on the green.'), (CLOSE, 'Final putt, tip the hat.')]),
    dict(sec='demo', clip=('slide-reply', 'SlideBelts'), title='Reply to a comment',
         cap='Reply to a real comment on screen ("which colour should I get?") and answer it with the hats in your hand.',
         argument='Answering a question people actually ask, so the video feels like a conversation, not an ad.',
         who='Creators who get comments', products='Two or three hats', format='Comment reply',
         visual_hook='The comment bubble on screen, hats fanned out in your hand.',
         rehook='Put the one you would pick on your head.',
         openers=['Someone asked which one to get. Real answer:', 'Replying to the comment asking if the marker falls off.', 'You asked which Bonk is my favourite.'],
         shots=[(OPEN, 'Comment on screen, hats in hand.'), (MID, 'Answer it: marker, slots, the colour you would pick.'), (CLOSE, 'Hat on: "this one."')]),
    dict(sec='course', clip=('mel-cart', 'Melin'), title='Sitting in the cart, telling it straight',
         cap='Sit in the cart, tell us why you wear it, then cut to you using it on the green.',
         argument='A real golfer in a real cart, talking like a friend about the hat he wears.',
         who='Any golfer comfortable talking to camera', products='Any hat', format='Talk to camera in the cart, cutaways',
         visual_hook='Phone on the dash, you turn to it mid-round and start talking.',
         rehook='Cut to the green: marker off the bill, mark, back on.',
         openers=['If I am golfing, I am wearing this.', 'Real talk from the cart.', 'Why I stopped wearing my other hats.'],
         shots=[(OPEN, 'In the cart, talking.'), (MID, 'Green: marker off, tee out of the side.'), (CLOSE, 'Back in the cart, nod. Drive off.')]),
    dict(sec='course', clip=('pa-fitcheck', 'Pins & Aces'), title='Bad golfer, good hat',
         cap='"Name a hat where you can shoot 100 and still get compliments." Fit check on the course, hand on the hat.',
         argument='You might not play well, but you look like you do.',
         who='Weekend golfers who are honest about their game', products='Any hat', format='Fit check on the course',
         visual_hook='A bad swing, then turn to the camera.',
         rehook='Touch the hat and the marker as you talk.',
         openers=['I shot 100 today and still got compliments on this hat.', 'I am not good at golf. My hat is.', 'Fellas, if you cannot play, at least look the part.'],
         shots=[(OPEN, 'Bad swing, turn to camera.'), (MID, 'Fit check: hat, marker, tee slots.'), (CLOSE, '"At least the hat is good."')]),
    dict(sec='demo', ad='52537373911813', title='No gimmicks',
         cap='"Golf gear that actually works." Your pile of hats, then the one with the marker on it.',
         argument='It is not a gimmick: two things that save you time every hole.',
         who='The skeptical golfer', products='Any snapback', format='On-course use',
         visual_hook='Marker clicks onto the bill in a tight close-up.',
         rehook='Pull a tee from the side without looking.',
         openers=['I thought this was a gimmick.', 'No gimmicks. Watch.', 'Two things this hat does.'],
         shots=[(OPEN, 'Marker click, close-up.'), (MID, 'Tee out of the slot on the tee box.'), (CLOSE, 'Swing, walk off.')]),
    dict(sec='gifts', clip=('jax-gift', 'JAXXON'), title='"He opened it and went quiet"',
         cap='The giver tells it: "It is his birthday and he has no idea." Show the box, then his reaction.',
         argument='A gift story told by the person who bought it, ending on him wearing it.',
         who='Wives, kids buying for him', products='Any hat or the set', format='Giver tells the story',
         visual_hook='Text on screen: "It is my husband\'s birthday and he has no say in what he is getting."',
         rehook='His quiet reaction when he opens it.',
         openers=['It is his birthday and he has no say in what he is getting.', 'I checked it before I wrapped it.', 'He opened it and went quiet.'],
         shots=[(OPEN, 'Box in your hands, the line.'), (MID, 'Him opening it.'), (CLOSE, 'Weeks later: still wearing it.')]),
    dict(sec='course', clip=('ves-japan', 'Vessel'), title='The early tee time POV',
         cap='Film your morning: alarm, coffee, the drive, the first tee. Hat on the whole way.',
         argument='The feeling of an early round, with the hat in every shot.',
         who='Golfers who love a dawn tee time', products='Any hat', format='POV day in the round',
         visual_hook='Dashboard clock at 5:30 and the sun coming up.',
         rehook='Grab the hat off the passenger seat at the course.',
         openers=['Why I wake up at 5am to golf.', 'POV: first tee time of the day.', 'The best part of the week.'],
         shots=[(OPEN, 'Car at dawn, clock on screen.'), (MID, 'Coffee, parking lot, hat on, tee out of the slot.'), (CLOSE, 'First drive into the sunrise.')]),
    dict(sec='demo', clip=('pa-price', 'Pins & Aces'), title='Say the price first',
         cap='Say what you paid in the first line, then show why it was worth it. Price only if it is on the site today.',
         argument='Answer the "that much for a hat?" question before anyone asks it.',
         who='Price-conscious golfers', products='Any hat', format='Price first, then the proof',
         visual_hook='Hat on a table, you say the price out loud.',
         rehook='Marker off the bill: "this is why."',
         openers=['I paid for this golf hat and here is why.', 'That much for a hat? Let me show you.', 'Is a golf hat worth it? This one is.'],
         shots=[(OPEN, 'Hat on the table, the price line.'), (MID, 'Marker, slots, fit.'), (CLOSE, '"Worth it."')]),
    dict(sec='demo', clip=('mel-inside', 'Melin'), title='Open it, try it on',
         cap='Hands only, phone above: open the box, turn the hat in your hands, pop the marker, put it on.',
         argument='The first-time feel of the hat, close up, like you are the one opening it.',
         who='Anyone who just got a Bonk hat', products='Any hat in its box', format='POV hands-only unboxing',
         visual_hook='The inside of the hat right up to the lens.',
         rehook='Marker comes off the bill in your fingers.',
         openers=['(no words, just the unboxing)', 'POV: your Bonk hat just showed up.', 'First look.'],
         shots=[(OPEN, 'Inside of the hat to the lens.'), (MID, 'Box, turn it, marker off and on, tee in the slot.'), (CLOSE, 'Put it on, from behind.')]),
    dict(sec='course', clip=('pm-cart', 'Piss Missile'), title='First time out with it (cart POV)',
         cap='POV from the cart: "Never tried this hat, what is the hype about?" Then you play with it and react.',
         argument='An honest first try, filmed from your own eyes.',
         who='Skeptical golfers', products='Any hat', format='Cart POV first try',
         visual_hook='Hand holding the hat up in the cart, big words on screen.',
         rehook='Your first time pulling a tee from the slot.',
         openers=['I have never used this hat. What is the hype?', 'First round with this hat.', 'Everyone keeps asking about this hat. Let us see.'],
         shots=[(OPEN, 'Cart POV, hat in hand.'), (MID, 'Holes: tee out, marker down.'), (CLOSE, 'Verdict to camera.')]),
    dict(sec='demo', clip=('ves-sound', 'Vessel'), title='The click',
         cap='No talking. Close mic, the marker clicking on and off the magnet.',
         argument='A sound people want to hear twice: the satisfying click of the marker.',
         who='Anyone who watches with the sound on', products='Any hat', format='Sound-only close-ups',
         visual_hook='Silence, then a loud magnet click.',
         rehook='Tee sliding into the slot, close mic.',
         openers=['(no words, just the click)', 'The best sound on the course.', 'Turn your sound on.'],
         shots=[(OPEN, 'Marker click, macro.'), (MID, 'Tee in, tee out.'), (CLOSE, 'Swing sound, ball flight.')]),
    dict(sec='drops', clip=('bb-never', 'Bogey Bros'), title='3 reasons you should NEVER buy a Bonk hat',
         cap='"3 reasons you should never buy a Bonk hat." Each reason is a joke that is really a reason to buy.',
         argument='Reverse psychology: the "reasons not to" are the reasons to.',
         who='Golfers who like a joke', products='Any hat', format='Reverse list',
         visual_hook='Hand on the hat, "3 reasons you should NEVER buy this".',
         rehook='Reason 3 lands on the course.',
         openers=['3 reasons you should never buy a Bonk hat.', 'Do not buy this hat. Here is why.', 'Warning: this hat ruins other hats.'],
         shots=[(OPEN, 'Hand on the hat, the title.'), (MID, '1. you will stop losing markers. 2. your buddies will want one.'), (CLOSE, '3. on the course: tee out of the slot.')]),
    dict(sec='course', clip=('mel-selfie', 'Melin'), title='Wearing them together',
         cap='Selfie with your kid or your buddy, both in Bonk hats. Ask them why they like theirs.',
         argument='Two people who both wear it, unscripted, is proof you cannot fake.',
         who='Dads and kids, buddies, couples', products='Two hats (youth size for kids)', format='Two-person selfie',
         visual_hook='Two faces squeeze into the frame, both hats on.',
         rehook='Ask the other person "why do you like yours?" and let them answer.',
         openers=['We are both rocking our Bonk hats today.', 'Asked my son why he loves his hat.', 'Matching hats, matching scores (not quite).'],
         shots=[(OPEN, 'Two-person selfie.'), (MID, 'They answer, show the marker on their bill.'), (CLOSE, '"All right, let us go." Walk off.')]),
    dict(sec='course', clip=('chub-skit', 'Chubbies'), title='"Nice hat." "Thanks." "Not you."',
         cap='Skit: someone says "nice hat", you say thanks, they were talking to your buddy in the Bonk hat.',
         argument='A quick joke that makes the hat the thing people notice.',
         who='Buddies who like a bit', products='Any hat', format='Two-person skit',
         visual_hook='Walking up to the clubhouse, someone points.',
         rehook="The punchline lands on the other guy's hat.",
         openers=['"Nice hat." "Thanks." "Not you."', 'Nobody compliments my outfit anymore.', 'I lost my compliments to a hat.'],
         shots=[(OPEN, 'Walk up, the compliment.'), (MID, '"No, I meant him." Close on his hat.'), (CLOSE, 'Tee shot, both laughing.')]),
    dict(sec='course', clip=('gg-tips', 'GhostGolf'), title='Tips first, hat second',
         cap='"Playing your first scramble? Three things." Real tips, and the hat is one of them.',
         argument='Useful advice people save, with the hat as one tip, not the whole pitch.',
         who='Golfers who like tips', products='Any hat', format='Tips list',
         visual_hook='"If you are playing your first scramble, listen up."',
         rehook='Tip two is the hat: tee and marker on your head, empty pockets.',
         openers=['Playing your first scramble? Three things.', 'Buddy trip this weekend? Bring these.', 'Three things that saved my round.'],
         shots=[(OPEN, 'Talk to camera, the opener.'), (MID, 'Tip one, then tip two: the hat, used.'), (CLOSE, 'Tip three, sign off.')]),
    dict(sec='course', clip=('ss-twotypes', 'Sunday Swagger'), title='Two types of golfers',
         cap='"There are two types of golfers." One digging in his pocket for a tee, one pulling it from his hat.',
         argument='A simple side by side that makes the old way look silly.',
         who='Golfers who like a bit', products='Any hat', format='Two types, side by side',
         visual_hook='Text on screen: "two types of golfers".',
         rehook='Cut to type two: tee out of the hat in one move.',
         openers=['There are two types of golfers.', 'Which golfer are you?', 'Golfer one vs golfer two.'],
         shots=[(OPEN, 'Type one: patting every pocket for a tee.'), (MID, 'Type two: tee out of the hat, marker off the bill.'), (CLOSE, '"Be type two."')]),
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
