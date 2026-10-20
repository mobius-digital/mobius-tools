# Gift cards, Dec 21 to 24: the 4 code ads (K01-K04) plus the card graphic itself. python hw/giftcard.py [ids|card]
# darteegolf.com sells NO gift card yet (checked Oct 20) and the "matched" bonus is still a draft, so no ad promises a bonus.
# These sell the plain digital card: arrives by email in seconds, any amount, he picks the belt, no size needed.
# Swap the words in once Dartee turns gift cards on (and locks the match, if they do).
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
import dt
from dt import img, lead, logo, topbar
from halloween import size, status, av, bub, row, GA, GB, GC
from PIL import Image

ADS = {}
def ad(i, body, bg='#0b0b0b'): ADS[i] = (body, bg)
def sh(src, w): return size(src, w=w)
TEAL = '#15C3B0'; RED = '#B3261E'

def card(x, y, w=700, amount='$100', rot=0, cls='t'):
    """The Dartee digital gift card, drawn in CSS. 1.586:1 like a real card."""
    h = round(w / 1.586); s = w / 700
    return (f'<div class="{cls}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;border-radius:{34*s:.0f}px;transform:rotate({rot}deg);'
            f'background:linear-gradient(135deg,#19d1bd 0%,#0f9f90 55%,#0b6f65 100%);box-shadow:0 {40*s:.0f}px {70*s:.0f}px rgba(0,0,0,.55);overflow:hidden">'
            f'<div style="position:absolute;left:{-120*s:.0f}px;top:{-160*s:.0f}px;width:{620*s:.0f}px;height:{620*s:.0f}px;border-radius:50%;background:rgba(255,255,255,.08)"></div>'
            f'<img src="../a/logo-white.png" style="position:absolute;left:{44*s:.0f}px;top:{40*s:.0f}px;height:{54*s:.0f}px">'
            f'<div style="position:absolute;right:{44*s:.0f}px;top:{46*s:.0f}px;font-family:Mono;font-size:{22*s:.0f}px;letter-spacing:.14em;color:rgba(255,255,255,.85)">GIFT CARD</div>'
            f'<div style="position:absolute;left:{44*s:.0f}px;bottom:{40*s:.0f}px;font-family:BCX;font-size:{150*s:.0f}px;line-height:.85;color:#fff">{amount}</div>'
            f'<div style="position:absolute;right:{44*s:.0f}px;bottom:{44*s:.0f}px;text-align:right;font-family:Mono;font-size:{20*s:.0f}px;letter-spacing:.1em;line-height:1.5;color:rgba(255,255,255,.85)">ANY BELT<br>ANY SIZE</div></div>')

# K01: Takomo, the card huge on black. "It's Dec 23. We know."
ad('K01',
   '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:radial-gradient(70% 55% at 55% 70%,#1b2a28 0%,#0d1413 55%,#060808 100%)"></div>'
   + topbar('Digital gift card &nbsp;/&nbsp; Dec 21 to 24')
   + '<div class="t disp" style="left:72px;width:936px;top:236px;font-size:140px">It’s Dec 23.<br><span style="color:' + TEAL + '">We know.</span></div>'
   + '<div class="t" style="left:72px;width:880px;top:500px;font-family:BarM;font-size:36px;line-height:1.3;color:#E6E2DA">The card lands in his inbox in seconds. He picks the belt. Nobody needs his size.</div>'
   + card(150, 660, 780, '$100', -6)
   + '<div class="t mono" style="left:72px;top:1176px">Any amount &nbsp;·&nbsp; arrives by email</div><div class="t mono" style="right:72px;top:1176px;color:' + TEAL + '">darteegolf.com</div>')

# K02: iMessage, it's dec 23
ad('K02',
   '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:#fff"></div>' + status()
   + '<div class="p" style="left:0;top:110px;width:1080px;height:178px;background:#f6f6f6;border-bottom:1px solid #dcdce0"></div>'
   + '<div class="p" style="left:34px;top:150px;font-family:Inter;font-size:52px;line-height:1;color:#0A84FF">&#8249;</div>'
   + av(504, 130, 84, 'J', GB)
   + '<div class="p" style="left:0;width:1080px;top:226px;text-align:center;font-family:InterS;font-size:23px;color:#000">Jess <span style="color:#8E8E93">&#8250;</span></div>'
   + '<div class="t" style="left:72px;width:936px;top:300px;text-align:center;font-family:Inter;font-size:23px;color:#8E8E93"><b style="font-family:InterS">Wed, Dec 23</b> 10:48 PM</div>'
   + bub('it’s dec 23 and I have nothing for mark', False, 360).replace('>M<', '>J<')
   + bub('dartee gift card. emailed. done.', True, 450, tail=False)
   + bub('does he pick the belt?', False, 540).replace('>M<', '>J<')
   + bub('yep. any colour, cut to fit, no size', True, 630)
   + bub('you’re a genius', False, 720).replace('>M<', '>J<')
   + bub('I know', True, 810)
   + '<div class="p" style="right:64px;top:890px;width:520px;height:330px;border-radius:30px;overflow:hidden;background:#e9e9eb">'
   + '<div style="height:250px;background:#0d1413;position:relative">' + card(80, 12, 360, '$100', 0, cls='p').replace('class="p" style="left:80px;top:12px', 'style="position:absolute;left:80px;top:12px') + '</div>'
   + '<div style="padding:14px 22px;font-family:InterS;font-size:22px;color:#000">Dartee Golf gift card<div style="font-family:Inter;font-size:18px;color:#8E8E93;margin-top:2px">darteegolf.com</div></div></div>'
   + '<div class="pb" style="right:64px;top:890px;width:520px;height:330px"></div>'
   + '<div class="p" style="left:0;top:1236px;width:1080px;height:114px;background:#fff"></div>'
   + '<div class="p" style="left:116px;top:1252px;width:924px;height:58px;border-radius:29px;border:2px solid #d1d1d6;font-family:Inter;font-size:26px;color:#b0b0b5;line-height:54px;padding-left:24px">iMessage</div>', bg='#fff')

# K03: Gmail, the card arriving
ad('K03',
   '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:#fff"></div>' + status()
   + '<div class="p" style="left:44px;top:140px;font-family:Inter;font-size:44px;color:#444">&#8592;</div>'
   + '<div class="t" style="left:72px;width:936px;top:220px;font-family:Inter;font-size:50px;line-height:1.15;color:#1f1f1f">Em sent you a Dartee Golf gift card</div>'
   + av(72, 370, 80, 'D', 'linear-gradient(180deg,#19d1bd,#0b6f65)')
   + '<div class="t" style="left:176px;top:374px;font-family:InterS;font-size:30px;color:#1f1f1f">Dartee Golf <span style="font-family:Inter;font-size:24px;color:#5f6368">&nbsp;Dec 24, 7:02 AM</span></div>'
   + '<div class="t" style="left:176px;top:416px;font-family:Inter;font-size:24px;color:#5f6368">to me &#9662;</div>'
   + card(120, 500, 840, '$100', 0)
   + '<div class="t" style="left:72px;width:936px;top:1060px;font-family:Inter;font-size:32px;line-height:1.45;color:#1f1f1f">“Merry Christmas, Dad. Pick the colour yourself this time. Love, Em”</div>'
   + '<div class="t" style="left:72px;width:936px;top:1160px;font-family:Inter;font-size:24px;color:#5f6368">Redeem at darteegolf.com. Any belt, cut once to fit.</div>', bg='#fff')

# K04: Shopify checkout, digital gift card
ad('K04',
   '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:#fff"></div>' + status()
   + '<div class="t" style="left:72px;top:160px;font-family:InterB;font-size:52px;color:#111">Checkout</div>'
   + '<div class="t" style="left:72px;width:936px;top:250px;display:flex;align-items:center;gap:26px;padding:24px 0;border-bottom:1px solid #e5e5e5">'
   + '<div style="width:220px;height:150px;border-radius:14px;background:#0d1413;display:flex;align-items:center;justify-content:center;position:relative">' + card(20, 18, 180, '$100', 0, cls='p').replace('class="p" style="left:20px;top:18px', 'style="position:absolute;left:20px;top:18px') + '</div>'
   + '<div style="flex:1;font-family:InterS;font-size:32px;color:#111">Digital gift card<div style="font-family:Inter;font-size:24px;color:#666;margin-top:6px">Sent by email, arrives in seconds</div></div><div style="font-family:InterS;font-size:32px">$100.00</div></div>'
   + '<div class="t" style="left:72px;width:936px;top:480px;font-family:InterS;font-size:28px;color:#111">Send to</div>'
   + '<div class="t" style="left:72px;width:936px;top:530px;height:90px;border:2px solid #ddd;border-radius:14px;padding:0 26px;font-family:Inter;font-size:30px;line-height:86px;color:#111">mark.t@gmail.com</div>'
   + '<div class="t" style="left:72px;width:936px;top:650px;font-family:InterS;font-size:28px;color:#111">Deliver on</div>'
   + '<div class="t" style="left:72px;width:936px;top:700px;height:90px;border:2px solid #ddd;border-radius:14px;padding:0 26px;font-family:Inter;font-size:30px;line-height:86px;color:#111">Dec 25, 2026 &nbsp;·&nbsp; 6:00 AM</div>'
   + '<div class="t" style="left:72px;width:936px;top:830px;padding:22px 26px;border-radius:14px;background:#E9F8F5;font-family:InterS;font-size:28px;line-height:1.3;color:#0b5e55">&#127873; Dec 24, 11:52 PM. Still counts as on time.</div>'
   + '<div class="t" style="left:72px;width:936px;top:1000px;height:110px;border-radius:16px;background:#111;color:#fff;font-family:InterB;font-size:34px;text-align:center;line-height:110px">Pay now</div>'
   + '<div class="t" style="left:72px;width:936px;top:1150px;text-align:center;font-family:Inter;font-size:24px;color:#666">He picks the belt. No size needed.</div>', bg='#fff')

def card_png():
    """Render the card alone on grey and crop it: the reference ChatGPT gets for the 4 scenes."""
    dt.render('DT-GC26-card', '<div class="p" style="left:0;top:0;width:1080px;height:1350px;background:#808080"></div>' + card(90, 390, 900, '$100', 0, cls='p'))
    im = Image.open(os.path.join(dt.OUT, 'DT-GC26-card.png')).crop((40, 340, 1040, 1010)); im.save(os.path.join(dt.A, 'giftcard.png')); print('a/giftcard.png', im.size)

if __name__ == '__main__':
    ids = sys.argv[1:] or list(ADS)
    if 'card' in ids: card_png(); ids.remove('card')
    for i in ids:
        b, bg = ADS[i]; dt.render(f'DT-GC26-{i}', b, bg=bg)
