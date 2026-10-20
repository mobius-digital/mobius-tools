# The ads that close the count to 160 (2026-10-20): giveaway G19-G20 (code) and Early Bird E16-E18 (code).
# The AI halves G17, G18, E19, E20 are ChatGPT scenes worded in fillai.py. python hw/fill.py [ids]
# Early Bird offer (Locus Season, locked): buy any belt, the second is 50% off, Nov 1 to 16. Textured leather $99, so the
# second is $49.50 and two are $148.50 (same numbers as EB05). Giveaway: 50 belts, 25 you + 25 your buddy, $4,500, ends Nov 16.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
import dt
from dt import img, lead, logo, topbar
from halloween import size, status, av, bub, row, GA, GB, GC

ADS = {}
def ad(i, body, bg='#0b0b0b'): ADS[i] = (body, bg)
def sh(src, w): return size(src, w=w)
TEAL = '#15C3B0'; PINK = '#E5498A'
WHITE = '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:#fff"></div>'
DROP = 'filter:drop-shadow(0 40px 40px rgba(0,0,0,.6))'

# ---------------- GIVEAWAY ----------------
# G19: Google, is the dartee giveaway real
ad('G19',
   WHITE + status()
   + '<div class="p" style="left:0;width:1080px;top:150px;text-align:center;font-family:InterB;font-size:54px"><span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span></div>'
   + '<div class="t" style="left:72px;width:936px;top:250px;height:84px;border-radius:42px;box-shadow:0 2px 8px rgba(0,0,0,.18);font-family:Inter;font-size:32px;color:#202124;line-height:84px;padding-left:40px">is the dartee giveaway real</div>'
   + '<div class="t" style="left:72px;width:936px;top:380px;font-family:InterS;font-size:26px;color:#202124">&#10022; AI Overview</div>'
   + '<div class="t" style="left:72px;width:936px;top:430px;font-family:Inter;font-size:36px;line-height:1.45;color:#202124"><b style="font-family:InterB">Yes.</b> Dartee Golf is giving away <b style="font-family:InterB">50 belts</b>: 25 to the winner and 25 to the buddy they pick, about <b style="font-family:InterB">$4,500</b> in belts. Entry is <b style="font-family:InterB">free</b> with an email and phone number, and it closes <b style="font-family:InterB">Nov 16</b>.</div>'
   + '<div class="p" style="left:72px;width:936px;top:800px;height:1px;background:#dadce0"></div>'
   + '<div class="t" style="left:72px;top:830px;font-family:Inter;font-size:24px;color:#202124">Dartee Golf &nbsp;<span style="color:#5f6368">Game of Belts</span></div>'
   + '<div class="t" style="left:72px;width:600px;top:874px;font-family:Inter;font-size:38px;line-height:1.2;color:#1a0dab">Game of Belts: win 25 belts each for two</div>'
   + '<div class="t" style="left:72px;width:600px;top:980px;font-family:Inter;font-size:26px;line-height:1.45;color:#4d5156">Enter free, pick your buddy. Ends Nov 16.</div>'
   + img('cut-box-open.png', 700, 860, *sh('cut-box-open.png', 300)), bg='#fff')

# G20: the real photo of the two guys, a Takomo label system on top
ad('G20',
   '<img class="p" src="../a/real-guys.jpg" style="left:-420px;top:0;width:2025px;height:1350px;object-fit:cover">'
   + '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 48%,rgba(0,0,0,.72) 70%,rgba(0,0,0,.85) 100%)"></div>'
   + logo(72, 150, 36, white=False) + '<div class="t mono" style="right:72px;top:156px;color:#111">Ends Nov 16</div>'
   + '<div class="t disp" style="left:72px;width:936px;top:800px;font-size:112px;color:#fff">This is what<br><span style="color:' + TEAL + '">winning</span> looks like.</div>'
   + '<div class="t" style="left:72px;width:936px;top:1080px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px">'
   + ''.join(f'<div style="border-top:2px solid rgba(255,255,255,.7);padding-top:10px"><div style="font-family:BC;font-size:64px;line-height:1;color:#fff">{a}</div><div style="font-family:Mono;font-size:20px;letter-spacing:.08em;text-transform:uppercase;color:#fff;margin-top:6px">{b}</div></div>'
             for a, b in [('50', 'belts'), ('25', 'for you'), ('25', 'your buddy'), ('$0', 'to enter')])
   + '</div>', bg='#fff')

# ---------------- EARLY BIRD ----------------
def safari(url):
    return (status() + '<div class="p" style="left:0;top:110px;width:1080px;height:96px;background:#f6f6f6;border-bottom:1px solid #ddd"></div>'
            + f'<div class="p" style="left:40px;top:126px;width:1000px;height:62px;border-radius:16px;background:#e8e8ea;font-family:Inter;font-size:26px;color:#333;text-align:center;line-height:62px">&#128274; {url}</div>')
item = lambda src, t, sub, price, strike='': (f'<div style="display:flex;align-items:center;gap:26px;padding:26px 0;border-bottom:1px solid #e5e5e5">'
        f'<div style="width:220px;height:160px;border-radius:14px;background:#f3f3f3;display:flex;align-items:center;justify-content:center"><img src="../a/{src}" style="width:190px"></div>'
        f'<div style="flex:1"><div style="font-family:InterS;font-size:32px;color:#111">{t}</div><div style="font-family:Inter;font-size:24px;color:#666;margin-top:6px">{sub}</div></div>'
        f'<div style="text-align:right">{strike}<div style="font-family:InterS;font-size:32px;color:#111">{price}</div></div></div>')
# E16: Shopify cart, the second belt half off
ad('E16',
   WHITE + safari('darteegolf.com/cart')
   + '<div class="t" style="left:72px;top:240px;font-family:InterB;font-size:56px;color:#111">Your cart</div>'
   + '<div class="t" style="left:72px;width:936px;top:320px">'
   + item('cut-midnight-black-caiman-0.png', 'Midnight Black Caiman', 'Cut to fit, 0 to 46', '$99.00')
   + item('cut-sahara-sunset-0.png', 'Sahara Sunset', 'Early Bird: second belt 50% off', '$49.50', '<div style="font-family:Inter;font-size:24px;color:#999;text-decoration:line-through">$99.00</div>')
   + '</div>'
   + '<div class="t" style="left:72px;width:936px;top:780px;padding:22px 26px;border-radius:14px;background:#E9F8F5;font-family:InterS;font-size:28px;color:#0b5e55">&#127381; Early Bird: your second belt is half off until Nov 16.</div>'
   + '<div class="t" style="left:72px;width:936px;top:930px;display:flex;justify-content:space-between;font-family:InterB;font-size:38px;color:#111"><span>Subtotal</span><span>$148.50</span></div>'
   + '<div class="t" style="left:72px;width:936px;top:1010px;height:110px;border-radius:16px;background:#111;color:#fff;font-family:InterB;font-size:34px;text-align:center;line-height:110px">Check out</div>'
   + '<div class="t" style="left:72px;width:936px;top:1150px;text-align:center;font-family:Inter;font-size:24px;color:#666">You saved $49.50 &nbsp;·&nbsp; ships within 24 hours</div>', bg='#fff')

# E17: iMessage, the buddy deal
ad('E17',
   WHITE + status()
   + '<div class="p" style="left:0;top:110px;width:1080px;height:178px;background:#f6f6f6;border-bottom:1px solid #dcdce0"></div>'
   + '<div class="p" style="left:34px;top:150px;font-family:Inter;font-size:52px;line-height:1;color:#0A84FF">&#8249;</div>'
   + av(504, 130, 84, 'R', GB)
   + '<div class="p" style="left:0;width:1080px;top:226px;text-align:center;font-family:InterS;font-size:23px;color:#000">Ryan <span style="color:#8E8E93">&#8250;</span></div>'
   + '<div class="t" style="left:72px;width:936px;top:300px;text-align:center;font-family:Inter;font-size:23px;color:#8E8E93"><b style="font-family:InterS">Tue, Nov 3</b> 7:48 PM</div>'
   + bub('ordering a dartee belt. want one?', True, 360, tail=False)
   + bub('how much', False, 450).replace('>M<', '>R<')
   + bub('second one is half off till the 16th. $49.50 for yours', True, 540)
   + bub('send me the black one', False, 690).replace('>M<', '>R<')
   + bub('you owe me a round', True, 780)
   + '<div class="p" style="right:64px;top:880px;width:520px;border-radius:30px;overflow:hidden;background:#e9e9eb">'
   + '<div style="height:230px;background:radial-gradient(70% 70% at 50% 55%,#2a2a2a,#0e0e0e);position:relative"><img src="../a/cut-midnight-black-caiman-0.png" style="position:absolute;left:70px;top:22px;width:380px"></div>'
   + '<div style="padding:14px 22px 16px;font-family:InterS;font-size:22px;color:#000">Early Bird: second belt 50% off<div style="font-family:Inter;font-size:18px;color:#8E8E93;margin-top:4px">darteegolf.com</div></div></div>'
   + '<div class="pb" style="right:64px;top:880px;width:520px;height:320px"></div>'
   + '<div class="p" style="left:0;top:1236px;width:1080px;height:114px;background:#fff"></div>'
   + '<div class="p" style="left:116px;top:1252px;width:924px;height:58px;border-radius:29px;border:2px solid #d1d1d6;font-family:Inter;font-size:26px;color:#b0b0b5;line-height:54px;padding-left:24px">iMessage</div>', bg='#fff')

# E18: Takomo, the math as a spec sheet on dark studio
w1, h1 = sh('cut-volcanic-ash-0.png', 640); w2, h2 = sh('cut-gulf-stream-gator-0.png', 560)
ad('E18',
   '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:radial-gradient(70% 55% at 60% 65%,#3a3a3a 0%,#1c1c1c 55%,#0c0c0c 100%)"></div>'
   + topbar('Early Bird &nbsp;/&nbsp; Nov 1 to 16')
   + '<div class="t disp" style="left:72px;width:936px;top:236px;font-size:150px">1 + &#189;</div>'
   + '<div class="t" style="left:72px;width:880px;top:380px;font-family:BarM;font-size:36px;line-height:1.3;color:#E6E2DA">Buy one belt. The second is <span style="color:' + TEAL + '">half off</span>. Any two, through Nov 16.</div>'
   + img('cut-volcanic-ash-0.png', 40, 560, w1, h1, css='transform:rotate(-6deg);' + DROP)
   + img('cut-gulf-stream-gator-0.png', 480, 800, w2, h2, css=DROP)
   + '<div class="t box" style="left:72px;top:1150px">Volcanic Ash &nbsp;·&nbsp; $99</div>'
   + '<div class="t box" style="right:72px;top:1150px;border-color:' + TEAL + '">Gulf Stream &nbsp;·&nbsp; $49.50</div>')

if __name__ == '__main__':
    pre = {'G': 'DT-GW26', 'E': 'DT-EB26'}
    for i in (sys.argv[1:] or list(ADS)):
        b, bg = ADS[i]; dt.render(f'{pre[i[0]]}-{i}', b, bg=bg)
