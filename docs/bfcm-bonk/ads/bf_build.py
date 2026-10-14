"""Bonk Golf Black Friday statics (Batch 2 of docs/bfcm-bonk-concepts.md, lines 1 to 24; 25 is a video).

Offer (Cole, Oct 14): the five-piece bundle at the site price $92.95 (snapback $42.95 + marker $19.95 + divot tool
$19.95 + towel $29.95 + tees $12.95 = $125.75), and Buy 2 Get 1 Free on HATS ONLY. Live Nov 27 to 30.
Real bonkgolf.com photos only. Change a price here and re-run; every ad picks it up.
Run: python bf_build.py, then render.ps1.
"""
import os
from build import CSS, HERE, photo

PRICE = '$92.95'
VALUE = '$125.75'
SAVE = '$32.80'
ITEMS = [('Snapback hat', '$42.95', 'smoke-show-0.jpg'), ('Ball marker', '$19.95', 'smoke-show-ball-marker-0.jpg'),
         ('Divot tool', '$19.95', 'hole-out-divot-tool-0.jpg'), ('Magnetic towel', '$29.95', 'bonk-magnetic-golf-towel-1.png'),
         ('Tees, 10 pack', '$12.95', 'bonk-performance-tees-0.jpg')]
B2G1 = 'Buy 2 hats. Get 1 free.'

CSS2 = CSS + """
body.dark{color:#fff}
body.dark .logo{filter:invert(1);mix-blend-mode:screen}
body.dark .sub,body.dark .foot,body.dark .who{color:#e6e6e6}
.lime{color:#c8f031}
.tag{display:inline-block;font-family:Anton,Impact,sans-serif;font-size:40px;letter-spacing:1px;background:#c8f031;color:#111;padding:8px 22px;border-radius:8px;margin-top:22px}
.card{position:absolute;left:50%;transform:translateX(-50%);background:#fff;border-radius:28px;overflow:hidden}
.card img{display:block;width:100%}
.price{font-family:Anton,Impact,sans-serif;font-size:120px;line-height:1}
.strike{text-decoration:line-through;color:#888}
.rcpt{position:absolute;top:400px;left:110px;right:110px;background:#fff;border-radius:22px;border:2px solid #111;padding:26px 34px}
.rcpt .row{display:flex;align-items:center;gap:18px;padding:8px 0;border-bottom:1.5px dashed #bbb;font-size:30px;font-weight:700}
.rcpt .row img{width:78px;height:78px;object-fit:cover;mix-blend-mode:multiply}
.rcpt .row span{flex:1}
.rcpt .tot{display:flex;justify-content:space-between;font-size:32px;font-weight:800;padding-top:16px}
.rcpt .pay{display:flex;justify-content:space-between;font-family:Anton,Impact,sans-serif;font-size:58px;padding-top:6px}
.rcpt .pay em{font-style:normal;background:#c8f031;padding:0 14px;border-radius:8px}
.cols{position:absolute;top:470px;left:70px;right:70px;display:flex;gap:26px}
.cols>div{flex:1;border-radius:22px;padding:26px 22px;text-align:center}
.cols .a{background:#f1f1f1}
.cols .b{background:#111;color:#fff}
.cols .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:16px 0}
.cols .grid img{width:100%;mix-blend-mode:multiply}
.cols h3{font-size:30px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px}
.cols .big{font-family:Anton,Impact,sans-serif;font-size:84px;margin-top:10px}
.label{position:absolute;font-size:28px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:#111;color:#fff;padding:8px 18px;border-radius:999px;transform:translateX(-50%)}
.sticker{position:absolute;top:420px;right:90px;width:270px;height:270px;border-radius:50%;background:#c8f031;color:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transform:rotate(10deg);font-weight:800;font-size:26px;line-height:1.15;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.sticker b{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:52px;line-height:1}
.split{position:absolute;top:400px;left:70px;right:70px;bottom:150px;display:flex;flex-direction:column;gap:22px}
.split>div{flex:1;border-radius:24px;display:flex;align-items:center;gap:22px;padding:20px 30px;background:#fff;border:2px solid #111}
.split img{width:300px;mix-blend-mode:multiply}
.split h2{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:58px;line-height:1.05;text-transform:uppercase}
.split p{font-size:28px;font-weight:700;margin-top:8px;color:#333}
"""


def page(name, bg, body, dark=False):
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>{name}</title>
<style>{CSS2}</style></head><body class="{'dark' if dark else ''}" style="--bg:{bg}"><img class="logo" src="assets/logo.png">{body}</body></html>"""
    with open(os.path.join(HERE, name + '.html'), 'w', encoding='utf-8') as f:
        f.write(html)


def card(src, top, w, h=None):
    h = h or w
    return f'<div class="card" style="top:{top}px;width:{w}px;height:{h}px"><img src="assets/flat/{os.path.splitext(src)[0]}.jpg" style="width:100%;height:100%;object-fit:cover"></div>'


def three(a, b, c, top=520, caps=('', '', '')):
    figs = ''.join(f'<figure><img src="assets/flat/{os.path.splitext(s)[0]}.jpg"><figcaption>{t}</figcaption></figure>' for s, t in zip((a, b, c), caps))
    return f'<div class="three" style="top:{top}px">{figs}</div>'


def receipt():
    rows = ''.join(f'<div class="row"><img src="assets/flat/{os.path.splitext(img)[0]}.jpg"><span>{n}</span><b>{p}</b></div>' for n, p, img in ITEMS)
    return (f'<div class="rcpt">{rows}<div class="tot"><span>Total</span><span class="strike">{VALUE}</span></div>'
            f'<div class="pay"><span>You pay</span><em>{PRICE}</em></div></div>')


SET0, SET1, SET2 = 'smoke-show-golf-gift-set-0.png', 'smoke-show-golf-gift-set-1.png', 'smoke-show-golf-gift-set-2.jpg'
W = '#ffffff'
ADS = {
    # The bundle
    'bf-01': (W, '<div class="head"><h1>Everything a<br>golfer needs.</h1>'
                 f'<p class="sub">Hat, ball marker, divot tool, towel and tees. {PRICE}.</p></div>'
                 + photo(SET0, 540, 640) + '<div class="foot">Black Friday</div>'),
    'bf-02': (W, '<div class="head"><h1 class="s">Black Friday. Itemized.</h1></div>' + receipt()
                 + f'<div class="foot">You save {SAVE}. Ends Nov 30.</div>'),
    'bf-03': ('#111', '<div class="head"><h1>5 pieces.<br>1 price.<br><span class="lime">{0}.</span></h1></div>'.format(PRICE)
                 + card(SET0, 600, 900, 640), True),
    'bf-04': (W, '<div class="head"><h1 class="s">It\'s time to retire<br>his old golf cap.</h1>'
                 f'<p class="sub">And give him the rest of the setup. {PRICE}.</p></div>' + photo(SET0, 500, 680)
                 + '<div class="foot">Black Friday: hat, marker, divot tool, towel, tees</div>'),
    'bf-05': (W, '<div class="head"><h1 class="s">Skip the gift card.</h1>'
                 f'<p class="sub">Give him the whole setup for {PRICE}.</p></div>' + photo(SET0, 450, 720)
                 + '<div class="foot">Hat, ball marker, divot tool, towel, tees</div>'),
    'bf-06': (W, '<div class="head"><div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>'
                 '<h1 class="quote" style="font-size:46px">"Received my new hat, ball marker and divot repair tool. '
                 'I have used them all and love the quality of every item."</h1><p class="who">Judge.me review</p></div>'
                 + photo(SET0, 640, 560) + f'<div class="foot">Black Friday: the full set, {PRICE}</div>'),
    'bf-07': (W, '<div class="head"><h1 class="s">One at a time,<br>or the box.</h1></div>'
                 '<div class="cols"><div class="a"><h3>One at a time</h3><div class="grid">'
                 + ''.join(f'<img src="assets/flat/{os.path.splitext(i)[0]}.jpg">' for _, _, i in ITEMS[:4])
                 + f'</div><div class="big strike">{VALUE}</div></div>'
                 f'<div class="b"><h3>The box</h3><div style="margin:16px 0;background:#fff;border-radius:14px;overflow:hidden">'
                 f'<img src="assets/flat/smoke-show-golf-gift-set-2.jpg" style="width:100%;display:block"></div><div class="big lime">{PRICE}</div></div></div>'),
    'bf-08': ('#111', '<div class="head"><h1 style="font-size:150px">Black<br>Friday.</h1>'
                 f'<p class="sub">Everything a golfer needs. <span class="lime">{PRICE}</span></p></div>' + card(SET1, 640, 900, 600), True),
    'bf-09': (W, '<div class="head"><h1 class="s">Every piece<br>fits the hat.</h1></div>' + card(SET1, 420, 700, 440)
                 + '<div class="callouts"><div><b>1</b>Marker clicks onto the magnet in the bill</div>'
                   '<div><b>2</b>Tees slide into the side slots</div>'
                   f'<div><b>3</b>The whole set, Black Friday: {PRICE}</div></div>'),
    'bf-10': (W, '<div class="head"><h1 class="s">You don\'t need<br>to know golf.</h1>'
                 f'<p class="sub">This box covers it. {PRICE}.</p></div>' + photo(SET0, 470, 700)
                 + '<div class="foot">Hat, ball marker, divot tool, towel, tees</div>'),
    # Buy 2 get 1, hats only
    'bf-11': (W, f'<div class="head"><h1>{B2G1.replace(". ", ".<br>")}</h1></div>'
                 + three('dunes-day-0.jpg', 'smoke-show-0.jpg', 'twilight-0.jpg', 560)
                 + '<div class="foot" style="bottom:330px;font-size:34px">Black Friday. Every hat counts.</div>'),
    'bf-12': (W, '<div class="head"><h1 class="s">One for you.<br>Two for the group.</h1>'
                 f'<p class="sub">{B2G1}</p></div>'
                 + three('viper-0.jpg', 'smoke-show-0.jpg', 'deep-focus-0.jpg', 560, ('You', 'Buddy', 'Buddy'))),
    'bf-13': (W, '<div class="head"><h1 class="s">Three gifts.<br>Pay for two.</h1>'
                 f'<p class="sub">{B2G1}</p></div>'
                 + three('pin-raider-0.jpg', 'dunes-day-0.jpg', 'twilight-0.jpg', 560, ('Dad', 'Brother', 'Him'))),
    'bf-14': (W, '<div class="head"><h1 class="s">Dad. Son. You.</h1>'
                 f'<p class="sub">Youth hats count too. {B2G1}</p></div>'
                 + three('twilight-0.jpg', 'youth-smoke-show-0.jpg', 'smoke-show-0.jpg', 540, ('Dad', 'Son (youth)', 'You'))),
    'bf-15': (W, '<div class="head"><h1 class="s">All three black ones.<br>Pay for two.</h1></div>'
                 + three('twilight-0.jpg', 'viper-0.jpg', 'pin-raider-0.jpg', 520, ('Twilight', 'Viper', 'Pin Raider'))
                 + f'<div class="foot" style="bottom:330px;font-size:34px">Black Friday: {B2G1}</div>'),
    'bf-16': (W, '<div class="head"><div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>'
                 '<h1 class="quote" style="font-size:48px">"Bought my wife and I hats, we love them! We love the matching ball markers too!"</h1>'
                 '<p class="who">Judge.me review</p></div>'
                 + three('twilight-open-back-0.jpg', 'smoke-show-0.jpg', 'dunes-day-0.jpg', 620, ('Hers', 'His', 'Free'))),
    'bf-17': (W, '<div class="head"><h1 class="s">Lefties count too.</h1>'
                 f'<p class="sub">Southpaw Snapbacks are in the deal. {B2G1}</p></div>' + photo('smoke-show-southpaw-1.jpg', 480, 720)),
    'bf-18': (W, '<div class="head"><h1 class="s">Fitted counts too.</h1>'
                 f'<p class="sub">Performance Fit 2.0, S/M to 2XL. {B2G1}</p></div>' + photo('smoke-1.jpg', 480, 720)),
    # Both deals, urgency, stickers
    'bf-19': ('#111', '<div class="head"><h1 style="font-size:130px">Buy 2 hats.<br><span class="lime">Get 1 free.</span></h1>'
                 '<p class="sub">Black Friday. Nov 27 to 30.</p></div>' + card('smoke-show-0.jpg', 660, 900, 580), True),
    'bf-20': (W, '<div class="head"><h1 class="s">Two Black Friday deals.</h1></div>'
                 f'<div class="split"><div><img src="assets/flat/smoke-show-golf-gift-set-2.jpg" style="border-radius:16px;mix-blend-mode:normal"><div><h2>The whole set<br>{PRICE}</h2><p>Hat, marker, divot tool, towel, tees</p></div></div>'
                 '<div><img src="assets/flat/smoke-show-0.jpg"><div><h2>Buy 2 hats<br>Get 1 free</h2><p>Every hat counts</p></div></div></div>'),
    'bf-21': ('#111', '<div class="head"><h1 style="font-size:140px">Ends<br><span class="lime">Monday.</span></h1>'
                 f'<p class="sub">The full set {PRICE}. Buy 2 hats, get 1 free.</p></div>' + card(SET0, 660, 900, 580), True),
    'bf-22': ('#111', '<div class="head"><h1 style="font-size:140px">Last<br><span class="lime">day.</span></h1>'
                 f'<p class="sub">Cyber Monday. The full set {PRICE}. Buy 2 hats, get 1 free. Ends tonight.</p></div>'
                 + card('twilight-1.jpg', 730, 900, 520), True),
    'bf-23': (W, '<div class="head"><h1>It\'s time to retire<br>his old golf cap.</h1></div>' + photo('dunes-day-1.jpg', 440, 760)
                 + '<div class="sticker"><b>Buy 2</b>hats, get<br>1 free<br><span style="font-size:20px">Black Friday</span></div>'
                 + '<div class="foot">Marker in the bill. Tees in the side.</div>'),
    'bf-24': (W, '<div class="head"><h1>Stop fumbling.<br>Start playing.</h1></div>' + photo('smoke-show-1.jpg', 430, 780)
                 + '<div class="sticker"><b>Buy 2</b>hats, get<br>1 free<br><span style="font-size:20px">Black Friday</span></div>'
                 + '<div class="foot">Marker on the bill. Tees in the side. Nothing in your pocket.</div>'),
}

if __name__ == '__main__':
    for name, spec in ADS.items():
        bg, body = spec[0], spec[1]
        page(name, bg, body, dark=len(spec) > 2 and spec[2])
        print('wrote', name)
