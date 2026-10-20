# Meta copy for every Dartee BFCM 2026 ad: headline (the bold line under the ad), primary text (above it), landing page.
# Written 2026-10-20 in Dartee's voice (the guy in the group chat: says little, a bit cocky, facts). No em dashes.
# Each phase has 3 or 4 primary texts; every ad names the one that fits it (Meta tests copy separately anyway).
# Written into each Locus Production card's brief by brief_push.js, where Launch to Meta reads it.

BELTS = 'https://darteegolf.com/collections/golf-belts'
GIVE = 'https://game-of-belts.lovable.app'

PHASES = {
 'HW': dict(card=394, link=BELTS, P=[
   "October looks better in black. Midnight Black Caiman, Bone Dry, Purple Reign. Marker on the buckle, tees and glove on the strap, pockets empty.\n\nThrow darts.",
   "The best costume at the scramble is the one that holds your marker.\n\nTextured leather, a magnetic marker on the buckle, cut once to fit. $99.",
   "No sale. No countdown. Just a better belt for the back nine.\n\nClicks every 1/8 inch, fits 0 to 46, ships in 24 hours.",
 ], ads={
  'H01': ('Dressed for the dark.', 0), 'H02': ('Bone Dry. See what\'s underneath.', 2), 'H03': ('Day shift. Night shift.', 0),
  'H04': ('It\'s called Bone Dry.', 1), 'H05': ('Costume: done. Pockets: empty.', 1), 'H06': ('Best dressed at the scramble.', 1),
  'H07': ('Midnight Black Caiman.', 0), 'H08': ('Pick of the patch.', 2), 'H09': ('Not made. Summoned.', 0),
  'H10': ('Came back for the belt.', 2), 'H11': ('+1 marker. +2 tees. +1 glove.', 2), 'H12': ('Nobody takes just one.', 1)}),
 'GW': dict(card=389, link=GIVE, P=[
   "We're giving away 50 belts. 25 for you, 25 for your buddy. That's $4,500 in belts.\n\nFree to enter. Pick your buddy. Ends Nov 16.",
   "Win 25 Dartee belts. Then your buddy gets 25 too.\n\nEmail and phone, that's it. Entries close Nov 16.",
   "The Game of Belts is on. One winner, one buddy, 50 belts between them.\n\nEnter free before Nov 16.",
 ], ads={
  'G1': ('25 for you. 25 for your buddy.', 0), 'G2': ('Win 50 belts.', 1), 'G3': ('25 of these are yours.', 1),
  'G5': ('Enter for your buddy.', 2), 'G6': ('Entered us both.', 2), 'G7': ('Where should we text you?', 1), 'G8': ('This is $4,500 in belts.', 0),
  'G12': ('Win 50 belts.', 0), 'G13': ('Bring the cart.', 2), 'G14': ('Your buddy owes you one.', 1), 'G15': ('Where do you put 50 belts?', 2),
  'G16': ('Fifty belts. Two winners.', 0), 'G17': ('Clear out the trunk.', 2), 'G18': ('One winner. One buddy.', 1),
  'G19': ('Yes, it\'s real. Enter free.', 0), 'G20': ('This is what winning looks like.', 1)}),
 'EB': dict(card=392, link=BELTS, P=[
   "Buy any belt, get the second one 50% off. Two textured leather belts for $148.50.\n\nEarly Bird runs Nov 1 to 16.",
   "One for you. One for your buddy, half off.\n\nAny two belts, Nov 1 to 16. Marker on the buckle, cut once to fit.",
   "You were going to grab a second colour anyway. Now it's half off.\n\nEarly Bird, Nov 1 to 16.",
 ], ads={
  'E1': ('Buy a belt. 2nd one 50% off.', 0), 'E2': ('Half off for your buddy.', 1), 'E3': ('Two golfers on your list?', 1),
  'E4': ('Second one half off.', 2), 'EB05': ('Buy one. Get one 50% off.', 0), 'E6': ('Smart golfers shop early.', 0),
  'E7': ('Midnight Black Caiman.', 2), 'E8': ('Best belt ever. Says Roy.', 2), 'E9': ('The second one\'s half off now.', 2),
  'E10': ('He doesn\'t have this one.', 1), 'E11': ('No size needed.', 1), 'E12': ('Two old belts. Two new ones.', 2),
  'E13': ('50% off ends Nov 16.', 0), 'E14': ('Get the colour before it goes.', 2), 'E15': ('Early Bird is on.', 0),
  'E16': ('$148.50 for two.', 0), 'E17': ('You owe me a round.', 1), 'E18': ('1 + 1/2.', 0), 'E19': ('Two belts. One tee time.', 1),
  'E20': ('Early bird gets the belt.', 2)}),
 'LB': dict(card=393, link=GIVE, P=[
   "Black Friday at Dartee: buy any belt, get a Raincheck belt free, plus up to 50% off.\n\nThe list shops it first, on Nov 24. Sign up.",
   "There are only so many free Rainchecks. The list gets first pick on Nov 24, two days before everyone.",
   "Want in early? Sign up and you shop Black Friday on Nov 24. Free belt with every order.",
 ], ads={
  'L01': ('Get in 48 hours early.', 0), 'L02': ('Yes. Nov 24 for the list.', 0), 'L03': ('The list gets first pick.', 1),
  'L04': ('Did you sign up?', 2), 'L05': ('Nov 24.', 2), 'L06': ('Step 1: sign up.', 1), 'L07': ('Front of the line.', 1), 'L08': ('The free belts are in here.', 1)}),
 'BF': dict(card=395, link=BELTS, P=[
   "Buy any belt, get a Raincheck belt free. Plus up to 50% off sitewide.\n\nNov 26 to 29. Where are we sending your free belt?",
   "Every order gets a free Raincheck belt this weekend. Every order.\n\nUp to 50% off on top. Ends Sunday.",
   "We will sell out. Last year we did.\n\nFree Raincheck with every order, up to 50% off, Nov 26 to 29.",
   "One's yours. One's free. Your buddy is going to ask where you got it, now you have one to hand him.\n\nBlack Friday, Nov 26 to 29.",
 ], ads={
  'B01': ('Buy a belt. Get one free.', 0), 'B02': ('The Black Friday issue.', 0), 'B03': ('Why a free belt?', 3), 'B04': ('Black Friday is on.', 0),
  'B05': ('Same buckle. $0.', 1), 'B06': ('Up to 50% off. 1 free belt.', 1), 'B07': ('The Raincheck is on us.', 3),
  'B08': ('Black Friday. Black belt.', 2), 'B09': ('Nov 26.', 2), 'B10': ('Free with every order.', 1), 'B11': ('One\'s yours. One\'s free.', 3),
  'B12': ('Saturday. 7:40 tee time.', 3), 'B13': ('Four days. Then full price.', 2), 'B14': ('Ice cold deal.', 1), 'B15': ('It\'s raining belts.', 1),
  'B16': ('One small step. One free belt.', 3), 'B17': ('Boss defeated. +1 belt.', 1), 'B18': ('One in each hand.', 3), 'B19': ('The Rainchecks. On tour.', 1),
  'B20': ('Today\'s special.', 0), 'B21': ('Free belt dispensed.', 1), 'B22': ('The second one is on us.', 3), 'B23': ('Warm weather optional.', 0),
  'B24': ('Most compliments in the foursome.', 3), 'B25': ('Arrives with a plus one.', 3), 'B26': ('X marks the free belt.', 1),
  'B27': ('A free belt is in your future.', 0), 'B28': ('Always play the pair.', 3), 'B29': ('Sunday\'s the last shake.', 2),
  'B30': ('Free belt in your cart.', 1), 'B31': ('Where are we sending it?', 0), 'B32': ('Who approved this??', 1), 'B33': ('Yes, it\'s real.', 0),
  'B34': ('Buy one. Get one. Keep both.', 3), 'B35': ('Ends Sunday.', 2), 'B36': ('Read the receipt twice.', 1), 'B37': ('Pick one. We tag the other.', 3),
  'B38': ('"I just kept them both."', 3), 'B39': ('Now he thinks he\'s better.', 3), 'B40': ('Hurry, before we sell out.', 2),
  'B41': ('We will sell out.', 2), 'B42': ('This one is on us.', 1), 'B43': ('Two belts. One order.', 0), 'B44': ('Four days. Then it\'s gone.', 2)}),
 'CM': dict(card=396, link=BELTS, P=[
   "Black Friday didn't end Sunday. Free Raincheck with every order and up to 50% off, through Thursday Dec 4.",
   "The sale stays. The Lizard is new: $120, not on sale. Everything else is.\n\nThrough Dec 4.",
   "Missed the weekend? You didn't. Free belt with every order until Dec 4.",
 ], ads={
  'M01': ('The sale stays.', 0), 'M02': ('The Lizard. $120.', 1), 'M03': ('Same deal, four more days.', 0), 'M04': ('It\'s still on.', 2),
  'M05': ('The Lizard drops Nov 30.', 1), 'M06': ('Still on till Thursday.', 2), 'M07': ('The sale stays. The Lizard\'s new.', 1),
  'M08': ('Yes, through Dec 4.', 0), 'M09': ('Back at work. Still on sale.', 2), 'M10': ('Cyber Monday. We had to.', 0),
  'M11': ('The Lizard drops at 9.', 1), 'M12': ('Showed up in the new one.', 2), 'M13': ('Still on sale.', 0), 'M14': ('Order from the commute.', 2),
  'M15': ('Order Monday. On by Saturday.', 0), 'M16': ('Added to cart.', 2)}),
 'GF': dict(card=397, link=BELTS, P=[
   "He has every club. He doesn't have this.\n\nNo size needed: he cuts it once and it fits 0 to 46. Comes in the gift box, no price inside. Ships in 24 hours.",
   "Don't know his size? Doesn't matter. Dartee belts cut once to fit.\n\nOrder by Dec 13 and it gets there for Christmas.",
   "\"Hubs is very picky about his belts and he loved this one.\" Kristina R.\n\nThe golf belt with his ball marker on the buckle. $99.",
 ], ads={
  'X01': ('Looks like you tried.', 0), 'X02': ('No size needed.', 1), 'X03': ('He\'s picky. He\'ll wear it.', 2), 'X04': ('First round in it.', 0),
  'X05': ('The box does half the talking.', 0), 'X06': ('He doesn\'t have this one.', 0), 'X07': ('Even the snowman wants one.', 1),
  'X08': ('Santa didn\'t need his size.', 1), 'X09': ('Hang it where he\'ll find it.', 2), 'X10': ('Opened first. Worn every round.', 2),
  'X11': ('On its way in 24 hours.', 1), 'X12': ('For the guy who has everything.', 0), 'X13': ('Comes in the gift box.', 0),
  'X14': ('What are we getting Dad?', 2), 'X15': ('One for everyone on the list.', 1), 'X16': ('Order by Dec 13.', 1),
  'X17': ('Last call for Christmas.', 1), 'X18': ('The gift for the guy who has everything.', 0), 'X19': ('Stop marking with a tee, Dad.', 2),
  'X20': ('The Christmas cutoffs.', 1)}),
 'GC': dict(card=398, link='https://darteegolf.com', P=[
   "It's Dec 23. We know.\n\nA Dartee gift card lands in his inbox in seconds. He picks the belt. Nobody needs his size.",
   "You forgot someone. It happens.\n\nDigital gift card, any amount, delivered by email.",
 ], ads={
  'K01': ('It\'s Dec 23. We know.', 0), 'K02': ('Gift card. Emailed. Done.', 0), 'K03': ('He picks the colour.', 1), 'K04': ('Still counts as on time.', 1),
  'K05': ('11:58pm. Still counts.', 0), 'K06': ('You get the credit.', 1), 'K07': ('Landed in seconds.', 0), 'K08': ('You forgot someone.', 1)}),
 'RB': dict(card=399, link=BELTS, P=[
   "Black Friday is back for six days. Free Raincheck with every order, up to 50% off.\n\nDec 26 to 31.",
   "Missed it? It's back. A free belt with every order until New Year's Eve.",
   "Spend the gift card on something he'll actually wear. Free Raincheck with every order through Dec 31.",
 ], ads={
  'R01': ('It\'s back.', 0), 'R02': ('Missed Black Friday?', 1), 'R03': ('The rerun.', 0), 'R04': ('New year. New belt.', 1), 'R05': ('The year-end issue.', 0),
  'R06': ('Keep the belt.', 2), 'R07': ('Dec 27. Still playing.', 0), 'R08': ('Grandma\'s $50 has a plan.', 2), 'R09': ('Last belt of 2026.', 1),
  'R10': ('The deal came back.', 1), 'R11': ('Two belts. One order.', 0), 'R12': ('The sale\'s back on.', 2), 'R13': ('Resolution #3: done.', 1),
  'R14': ('Check the date.', 0), 'R15': ('Six days. Then 2027.', 0), 'R16': ('Yes, Dec 26 to 31.', 0)}),
}
