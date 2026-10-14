"""Bonk Golf Early Black Friday statics (offer-free lines 1 to 11 of docs/bfcm-bonk-concepts.md).

Real bonkgolf.com Shopify photos only (Floyd: no AI imagery, ever). 1080x1350, every word inside the
1:1 safe zone (y 135 to 1215). Writes ebf-XX.html next to this file; render.ps1 turns them into out/*.png.
Run: python build.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{background:var(--bg,#fff);font-family:Inter,Arial,sans-serif;color:#111;position:relative}
.logo{position:absolute;top:150px;left:50%;transform:translateX(-50%);height:56px;mix-blend-mode:multiply}
.head{position:absolute;top:236px;left:80px;right:80px;text-align:center}
h1{font-family:Anton,Impact,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:.5px;line-height:1.02;font-size:92px}
h1.s{font-size:76px}
.sub{margin-top:18px;font-size:34px;font-weight:600;line-height:1.28;color:#333}
.eyebrow{display:inline-block;font-size:24px;font-weight:800;letter-spacing:4px;text-transform:uppercase;background:#111;color:#fff;padding:9px 18px;border-radius:6px;margin-bottom:20px}
.photo{position:absolute;left:50%;transform:translateX(-50%);mix-blend-mode:multiply}
.foot{position:absolute;bottom:150px;left:80px;right:80px;text-align:center;font-size:27px;font-weight:700;letter-spacing:.3px;color:#222}
.btn{display:inline-block;background:#111;color:#fff;font-weight:800;font-size:30px;letter-spacing:1.5px;text-transform:uppercase;padding:20px 46px;border-radius:999px}
.quote{font-family:Inter,Arial,sans-serif;font-weight:800;font-size:52px;line-height:1.18;letter-spacing:-.5px;text-transform:none}
.stars{font-size:38px;letter-spacing:6px;color:#111;margin-bottom:16px}
.who{margin-top:18px;font-size:26px;font-weight:600;color:#555}
.callouts{position:absolute;bottom:150px;left:80px;right:80px;display:flex;flex-direction:column;gap:14px}
.callouts div{display:flex;align-items:center;gap:20px;font-size:31px;font-weight:700;background:#fff;border:2px solid #111;border-radius:14px;padding:16px 22px}
.callouts b{flex:none;width:46px;height:46px;border-radius:50%;background:#111;color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center}
.three{position:absolute;top:500px;left:0;right:0;display:flex;justify-content:center;gap:0}
.three figure{width:360px;text-align:center}
.three img{width:360px;margin:0;mix-blend-mode:multiply}
.three figcaption{font-size:30px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-top:-40px}
"""

LOGO = '<img class="logo" src="assets/logo.png">'


def page(name, bg, body):
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>{name}</title>
<style>{CSS}</style></head><body style="--bg:{bg}">{LOGO}{body}</body></html>"""
    with open(os.path.join(HERE, name + '.html'), 'w', encoding='utf-8') as f:
        f.write(html)


def photo(src, top, w, cls=''):
    return f'<img class="photo {cls}" src="assets/flat/{os.path.splitext(src)[0]}.jpg" style="top:{top}px;width:{w}px">'


ADS = {
    # 1. Retire his old cap (235 B rebuilt)
    'ebf-01': ('#ffffff',
        '<div class="head"><h1>It\'s time to retire<br>his old golf cap.</h1></div>'
        + photo('dunes-day-1.jpg', 440, 760)
        + '<div class="foot">Marker in the bill. Tees in the side.</div>'),
    # 2. Not another golf-themed guess
    'ebf-02': ('#ffffff',
        '<div class="head"><h1>Skip the golf-themed gift.</h1>'
        '<p class="sub">Get the hat he\'ll wear every round.</p></div>'
        + photo('smoke-show-0.jpg', 470, 740)
        + '<div class="foot">The Smoke Show Snapback</div>'),
    # 3. Built in, not bolted on (feature callouts)
    'ebf-03': ('#ffffff',
        '<div class="head"><h1>Built in.<br>Not bolted on.</h1></div>'
        + photo('twilight-1.jpg', 360, 560)
        + '<div class="callouts">'
          '<div><b>1</b>A magnet in the bill holds your marker</div>'
          '<div><b>2</b>Tee slots built into the side</div>'
          '<div><b>3</b>Matching ball marker in the box</div></div>'),
    # 4. Review: tees somewhere other than his ears (Pin Raider review)
    'ebf-04': ('#ffffff',
        '<div class="head"><div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>'
        '<h1 class="quote">"My husband loved how his tees have a place other than his ears."</h1>'
        '<p class="who">Judge.me review, Pin Raider Snapback</p></div>'
        + photo('pin-raider-0.jpg', 560, 640)),
    # 5. Review: coolest golf hat ever made (Viper review)
    'ebf-05': ('#ffffff',
        '<div class="head"><div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>'
        '<h1 class="quote">"Man coolest golf hat ever made!"</h1>'
        '<p class="who">Judge.me review, Viper Snapback</p></div>'
        + photo('viper-0.jpg', 480, 760)),
    # 6. Stop fumbling. Start playing. (225 B line)
    'ebf-06': ('#ffffff',
        '<div class="head"><h1>Stop fumbling.<br>Start playing.</h1></div>'
        + photo('smoke-show-1.jpg', 430, 780)
        + '<div class="foot">Marker on the bill. Tees in the side. Nothing in your pocket.</div>'),
    # 7. The black ones (three-up)
    'ebf-07': ('#ffffff',
        '<div class="head"><h1>Black goes with<br>every bag.</h1></div>'
        '<div class="three">'
        '<figure><img src="assets/flat/twilight-0.jpg"><figcaption>Twilight</figcaption></figure>'
        '<figure><img src="assets/flat/viper-0.jpg"><figcaption>Viper</figcaption></figure>'
        '<figure><img src="assets/flat/pin-raider-0.jpg"><figcaption>Pin Raider</figcaption></figure></div>'
        '<div class="foot" style="bottom:360px;font-size:36px">Three black Snapbacks. Pick his.</div>'),
    # 8. Lefties (Southpaw photo only)
    'ebf-08': ('#ffffff',
        '<div class="head"><h1>Built for lefties.<br>Finally.</h1></div>'
        + photo('smoke-show-southpaw-1.jpg', 440, 760)
        + '<div class="foot">The Southpaw Snapback</div>'),
    # 9. Women's open back (Clean Open Back review)
    'ebf-09': ('#ffffff',
        '<div class="head"><div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>'
        '<h1 class="quote" style="font-size:46px">"My curly ponytail fits comfortably through 1 of 3 locations. '
        'The magnetic ball marker stays on and my tees are quickly available!"</h1>'
        '<p class="who">Judge.me review, Clean Open Back</p></div>'
        + photo('clean-open-back-1.jpg', 620, 560)),
    # 10. Youth
    'ebf-10': ('#ffffff',
        '<div class="head"><div class="eyebrow">Youth size</div>'
        '<h1 class="s">Make the junior golfer<br>feel legit.</h1></div>'
        + photo('youth-smoke-show-0.jpg', 500, 720, 'soft')
        + '<div class="foot">Same built-in marker and tee slots, sized for kids.</div>'),
    # 11. List first (HOLD until Floyd confirms the plan; no price)
    'ebf-11': ('#ffffff',
        '<div class="head"><h1 class="s">New holiday bundles.</h1>'
        '<p class="sub">The list sees them first.</p></div>'
        + photo('smoke-show-golf-gift-set-0.png', 380, 780, 'soft')
        + '<div class="foot" style="bottom:160px"><span class="btn">Join the list</span></div>'),
}

if __name__ == '__main__':
    for name, (bg, body) in ADS.items():
        page(name, bg, body)
        print('wrote', name)
