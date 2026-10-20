# Cyber Monday + the Lizard, Nov 30 to Dec 4: the 8 code ads (M01-M08). python hw/cyber.py [ids]
# Offer: the Black Friday offer stays through Dec 4 (free Raincheck with every order + up to 50% off). The Lizard drops Monday
# at $120, never discounted. NO LIZARD PHOTO EXISTS YET (Oct 20): M02 and M05 show the belt blacked out as a tease, and get
# re-rendered on the real cut-out (a/cut-lizard-0.png) when Dartee sends it. Only real prices: $99, $69, $120. Accent: cyber blue.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
import dt
from dt import img, lead, logo, topbar
from halloween import size, status, av, bub, row, GA, GB, GC

ADS = {}
def ad(i, body, bg='#0b0b0b'): ADS[i] = (body, bg)
def sh(src, w): return size(src, w=w)
BLUE = '#5FD3FF'
OFFER = 'Free Raincheck with every order &nbsp;·&nbsp; up to 50% off'
DATES = 'Nov 30 to Dec 4'
DARK = 'radial-gradient(70% 55% at 60% 65%,#1e2a33 0%,#0f161b 55%,#07090b 100%)'
LIGHT = 'radial-gradient(75% 60% at 55% 62%,#f4f6f7 0%,#dfe4e7 55%,#c6ccd0 100%)'
DROP = 'filter:drop-shadow(0 40px 40px rgba(0,0,0,.6))'
DROPL = 'filter:drop-shadow(0 40px 40px rgba(0,0,0,.28))'
Bl = lambda t: f'<span style="color:{BLUE}">{t}</span>'
LIZ = os.path.exists(os.path.join(dt.A, 'cut-lizard-0.png'))
LIZCUT = 'cut-lizard-0.png' if LIZ else 'cut-midnight-black-caiman-1.png'
# the tease: the belt shape only, blacked out, one rim light. Replaced by the real belt once the photo lands.
TEASE = '' if LIZ else 'filter:brightness(0.06) contrast(1.2) drop-shadow(0 0 2px rgba(95,211,255,.9)) drop-shadow(0 40px 40px rgba(0,0,0,.6));'

# ================= TAKOMO / studio =================
# M01: label system, the sale stays
w, h = sh('cut-gulf-stream-gator-0.png', 1000)
ad('M01',
   f'<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:{DARK}"></div>'
   + topbar('Cyber Monday &nbsp;/&nbsp; ' + DATES)
   + '<div class="t disp" style="left:72px;width:936px;top:236px;font-size:150px">The sale<br>' + Bl('stays.') + '</div>'
   + img('cut-gulf-stream-gator-0.png', 40, 520, w, h, css='transform:rotate(-4deg);' + DROP)
   + lead(240, 1130, 330, 760) + lead(560, 1130, 600, 900) + lead(860, 1130, 790, 700)
   + '<div class="t mono" style="left:72px;top:1140px;width:300px">Free Raincheck<br>with every order</div>'
   + '<div class="t mono" style="left:400px;top:1140px;width:300px">Up to 50% off<br>through Dec 4</div>'
   + '<div class="t mono" style="left:736px;top:1140px;width:280px">Gulf Stream<br>$99</div>')

# M02: the Lizard tease (silhouette until the photo lands)
w, h = sh(LIZCUT, 860)
ad('M02',
   '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:radial-gradient(60% 45% at 50% 62%,#10181d 0%,#05070a 70%)"></div>'
   + topbar('New &nbsp;/&nbsp; Monday, Nov 30')
   + '<div class="t disp" style="left:72px;width:936px;top:236px;font-size:150px">The Lizard.</div>'
   + '<div class="t" style="left:72px;width:900px;top:380px;font-family:BarM;font-size:36px;line-height:1.3;color:#E6E2DA">$120. Not on sale. <span style="color:' + BLUE + '">Everything else is.</span></div>'
   + img(LIZCUT, 100, 520, w, h, css=TEASE + 'transform:rotate(-6deg)')
   + '<div class="t mono" style="left:72px;top:1150px">Drops 9am &nbsp;·&nbsp; Nov 30</div><div class="t mono" style="right:72px;top:1150px;color:' + BLUE + '">Never discounted</div>')

# M03: split frame, Friday / Monday
w1, h1 = sh('cut-midnight-black-caiman-0.png', 490); w2, h2 = sh('cut-bone-dry-0.png', 490)
ad('M03',
   '<div class="p" style="left:0;top:0;width:540px;height:1350px;background:#0b0b0b"></div><div class="p" style="left:540px;top:0;width:540px;height:1350px;background:#F1F4F5"></div>'
   + '<div class="p" style="left:539px;top:0;width:2px;height:1350px;background:' + BLUE + '"></div>'
   + logo(72, 150, 34, white=True) + logo(72, 150, 34, white=False, right=True)
   + '<div class="t disp" style="left:72px;top:290px;font-size:104px">Black<br>Friday.</div>'
   + '<div class="t disp" style="right:72px;top:290px;font-size:104px;text-align:right;color:#141414">Cyber<br>Monday.</div>'
   + img('cut-midnight-black-caiman-0.png', 25, 640, w1, h1, css='filter:drop-shadow(0 30px 40px rgba(0,0,0,.8))')
   + img('cut-bone-dry-0.png', 565, 640 + (h1 - h2) // 2, w2, h2, css='filter:drop-shadow(0 30px 40px rgba(0,0,0,.25))')
   + '<div class="t mono" style="left:72px;top:1090px">Free Raincheck<br>with every order</div><div class="t mono" style="right:72px;top:1090px;text-align:right;color:#141414">Same deal.<br>Through Dec 4</div>'
   + '<div class="t box" style="left:50%;top:1160px;transform:translateX(-50%);border-color:' + BLUE + ';color:#F2EFE8;background:#0b0b0b">Same deal, four more days</div>')

# M04: giant MON, belt across it
w, h = sh('cut-purple-reign-gator-0.png', 820)
ad('M04',
   f'<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:{LIGHT}"></div>'
   + topbar('Cyber Monday &nbsp;/&nbsp; ' + DATES, white=False)
   + '<div class="t" style="left:72px;width:936px;top:230px;text-align:center;font-family:BCX;font-size:420px;line-height:.82;letter-spacing:-.02em;color:#111">MON</div>'
   + '<div class="t" style="left:72px;width:936px;top:590px;font-family:BarM;font-size:34px;line-height:1.3;color:#222">Black Friday did not end Sunday. A free Raincheck with every order and up to 50% off, through Thursday.</div>'
   + img('cut-purple-reign-gator-0.png', 90, 690, w, h, css='transform:rotate(-5deg);' + DROPL)
   + '<div class="t mono" style="right:72px;top:1176px;color:#111">Purple Reign &nbsp;·&nbsp; $99 &nbsp;·&nbsp; ends Dec 4</div>')

# ================= CODE / native =================
WHITE = '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:#fff"></div>'
def safari(url):
    return (status() + '<div class="p" style="left:0;top:110px;width:1080px;height:96px;background:#f6f6f6;border-bottom:1px solid #ddd"></div>'
            + f'<div class="p" style="left:40px;top:126px;width:1000px;height:62px;border-radius:16px;background:#e8e8ea;font-family:Inter;font-size:26px;color:#333;text-align:center;line-height:62px">&#128274; {url}</div>')

# M05: Shopify product page, notify me (the Lizard, blacked out until the photo lands)
w, h = sh(LIZCUT, 600)
ad('M05',
   WHITE + safari('darteegolf.com/products/the-lizard')
   + '<div class="p" style="left:72px;top:240px;width:936px;height:520px;border-radius:18px;background:#111;overflow:hidden"></div>'
   + img(LIZCUT, 240, 290, w, h, css=TEASE + 'transform:rotate(-4deg)')
   + '<div class="t" style="left:100px;top:270px;padding:8px 18px;border-radius:8px;background:' + BLUE + ';color:#06231f;font-family:InterB;font-size:24px">NEW</div>'
   + '<div class="t" style="left:72px;top:800px;font-family:InterB;font-size:50px;color:#111">The Lizard</div>'
   + '<div class="t" style="right:72px;top:808px;font-family:InterB;font-size:40px;color:#111">$120.00</div>'
   + '<div class="t" style="left:72px;width:936px;top:870px;font-family:Inter;font-size:28px;line-height:1.4;color:#555">Embossed lizard texture. Magnetic marker buckle. Cut once, fits 0 to 46. Not part of the sale.</div>'
   + '<div class="t" style="left:72px;width:936px;top:990px;height:100px;border-radius:14px;background:#111;color:#fff;font-family:InterB;font-size:32px;text-align:center;line-height:100px">Notify me &nbsp;·&nbsp; drops Mon, Nov 30, 9am</div>'
   + '<div class="t" style="left:72px;width:936px;top:1120px;text-align:center;font-family:Inter;font-size:26px;color:#666">Everything else is up to 50% off through Dec 4</div>', bg='#fff')

# M06: iMessage, the sale is still on
ad('M06',
   WHITE + status()
   + '<div class="p" style="left:0;top:110px;width:1080px;height:178px;background:#f6f6f6;border-bottom:1px solid #dcdce0"></div>'
   + '<div class="p" style="left:34px;top:150px;font-family:Inter;font-size:52px;line-height:1;color:#0A84FF">&#8249;</div>'
   + av(504, 130, 84, 'K', GC)
   + '<div class="p" style="left:0;width:1080px;top:226px;text-align:center;font-family:InterS;font-size:23px;color:#000">Kyle <span style="color:#8E8E93">&#8250;</span></div>'
   + '<div class="t" style="left:72px;width:936px;top:300px;text-align:center;font-family:Inter;font-size:23px;color:#8E8E93"><b style="font-family:InterS">Mon, Nov 30</b> 8:41 AM</div>'
   + bub('missed the dartee sale didn’t i', False, 360).replace('>M<', '>K<')
   + bub('nope. still on till thursday', True, 450, tail=False)
   + bub('the free belt thing too?', False, 540).replace('>M<', '>K<')
   + bub('yep. raincheck free with every order', True, 630)
   + bub('ok ordering from my desk 🔥', False, 720).replace('>M<', '>K<')
   + '<div class="p" style="right:64px;top:820px;width:520px;border-radius:30px;overflow:hidden;background:#e9e9eb">'
   + '<div style="height:230px;background:radial-gradient(70% 70% at 50% 55%,#2a2a2a,#0e0e0e);position:relative"><img src="../a/cut-sahara-sunset-0.png" style="position:absolute;left:70px;top:22px;width:380px"></div>'
   + '<div style="padding:14px 22px 16px;font-family:InterS;font-size:22px;color:#000">Cyber Monday: the sale stays<div style="font-family:Inter;font-size:18px;color:#8E8E93;margin-top:4px">darteegolf.com</div></div></div>'
   + '<div class="pb" style="right:64px;top:820px;width:520px;height:320px"></div>'
   + '<div class="p" style="left:0;top:1236px;width:1080px;height:114px;background:#fff"></div>'
   + '<div class="p" style="left:116px;top:1252px;width:924px;height:58px;border-radius:29px;border:2px solid #d1d1d6;font-family:Inter;font-size:26px;color:#b0b0b5;line-height:54px;padding-left:24px">iMessage</div>', bg='#fff')

# M07: lock screen, three notifications
def notif(top, title, body, when, dark_logo=True):
    return (f'<div class="t" style="left:72px;width:936px;top:{top}px;padding:24px 28px;border-radius:30px;background:rgba(255,255,255,.72);backdrop-filter:blur(20px)">'
            f'<div style="display:flex;align-items:center;gap:18px"><div style="width:64px;height:64px;border-radius:16px;background:#0e3b37;display:flex;align-items:center;justify-content:center"><img src="../a/logo-white.png" style="width:48px"></div>'
            f'<div style="flex:1"><div style="display:flex;justify-content:space-between;font-family:InterS;font-size:28px;color:#111"><span>{title}</span><span style="font-family:Inter;font-size:22px;color:#555">{when}</span></div>'
            f'<div style="font-family:Inter;font-size:27px;line-height:1.3;color:#222;margin-top:4px">{body}</div></div></div></div>')
w, h = sh('cut-sea-swell-blue-1-0.png', 780)
ad('M07',
   '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:linear-gradient(180deg,#5a6f85 0%,#2c3a49 45%,#0e151c 100%)"></div>'
   + img('cut-sea-swell-blue-1-0.png', 150, 900, w, h, css='transform:rotate(-14deg);filter:drop-shadow(0 40px 50px rgba(0,0,0,.6))')
   + '<div class="p" style="left:0;width:1080px;top:150px;text-align:center;font-family:Inter;font-size:30px;color:#fff;opacity:.9">Monday, November 30</div>'
   + '<div class="t" style="left:72px;width:936px;top:190px;text-align:center;font-family:InterM;font-size:170px;line-height:1;color:#fff">8:41</div>'
   + notif(400, 'Dartee Golf', 'Cyber Monday: Black Friday stays through Dec 4. Free Raincheck with every order, up to 50% off.', 'now')
   + notif(590, 'Dartee Golf', 'The Lizard just dropped. $120, not part of the sale.', '9m ago')
   + notif(730, 'Kyle', 'did you see the sale is still on', '12m ago')
   + '<div class="p" style="left:0;top:1236px;width:1080px;height:114px"></div>'
   + '<div class="p" style="left:490px;top:1300px;width:100px;height:8px;border-radius:4px;background:rgba(255,255,255,.8)"></div>', bg='#2c3a49')

# M08: Google, is dartee doing cyber monday
ad('M08',
   WHITE + status()
   + '<div class="p" style="left:0;width:1080px;top:150px;text-align:center;font-family:InterB;font-size:54px"><span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span></div>'
   + '<div class="t" style="left:72px;width:936px;top:250px;height:84px;border-radius:42px;box-shadow:0 2px 8px rgba(0,0,0,.18);font-family:Inter;font-size:32px;color:#202124;line-height:84px;padding-left:40px">is dartee doing cyber monday</div>'
   + '<div class="t" style="left:72px;width:936px;top:380px;font-family:InterS;font-size:26px;color:#202124">&#10022; AI Overview</div>'
   + '<div class="t" style="left:72px;width:936px;top:430px;font-family:Inter;font-size:36px;line-height:1.45;color:#202124">Yes. Dartee Golf keeps its Black Friday offer running through <b style="font-family:InterB">Thursday, Dec 4</b>: a <b style="font-family:InterB">free Raincheck belt with every order</b> and <b style="font-family:InterB">up to 50% off</b>. A new belt, the Lizard, drops Nov 30 at $120 and is not discounted.</div>'
   + '<div class="p" style="left:72px;width:936px;top:800px;height:1px;background:#dadce0"></div>'
   + '<div class="t" style="left:72px;top:830px;font-family:Inter;font-size:24px;color:#202124">Dartee Golf &nbsp;<span style="color:#5f6368">darteegolf.com</span></div>'
   + '<div class="t" style="left:72px;width:936px;top:874px;width:600px;font-family:Inter;font-size:38px;line-height:1.2;color:#1a0dab">Cyber Monday: the sale stays, the Lizard is new</div>'
   + '<div class="t" style="left:72px;width:600px;top:980px;font-family:Inter;font-size:26px;line-height:1.45;color:#4d5156">Magnetic marker buckle, cut once to fit. Ends Dec 4.</div>'
   + img('cut-volcanic-ash-0.png', 720, 900, *sh('cut-volcanic-ash-0.png', 280)), bg='#fff')

if __name__ == '__main__':
    for i in (sys.argv[1:] or list(ADS)):
        b, bg = ADS[i]; dt.render(f'DT-CM26-{i}', b, bg=bg)
