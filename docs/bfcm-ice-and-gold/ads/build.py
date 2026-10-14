"""Ice & Gold, Batch 1 "Early Bird" statics (live Nov 2 to 25): free studs on any order over $125, list gets
Black Friday 24 hours early (Thu Nov 26). Offer locked with Fela Oct 13 (season-seed-034).

Real iceandgold.com Shopify photos only (Fela: real photos, no AI people). 1080x1350, every word inside the
1:1 safe zone (y 135 to 1215). Rules: the product leads, the gift is the second line (Dartee "FREE HAT" lost
in 2025); "18K gold over stainless steel", never "plated"; no em dashes; no owambe / founder (Fela, Oct 13).
Writes eb-XX.html next to this file; render.ps1 turns them into out/*.png.
Run: python build.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{background:var(--bg,#F6F0E6);font-family:Inter,Arial,sans-serif;color:#1C1712;position:relative}
.bleed{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover}
.logo{position:absolute;top:150px;left:50%;transform:translateX(-50%);height:62px}
.logo.l{left:80px;transform:none}
.serif{font-family:'Cormorant Garamond',Georgia,serif}
h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;line-height:1.02;letter-spacing:-.5px}
.gold{color:#B9791A}
.pill{display:inline-block;background:#1C1712;color:#F3D9A4;font-weight:800;font-size:27px;letter-spacing:2.2px;text-transform:uppercase;padding:18px 30px;border-radius:999px}
.pill.light{background:#F3D9A4;color:#1C1712}
.date{font-size:23px;font-weight:600;letter-spacing:3px;text-transform:uppercase;margin-top:16px}
.band{position:absolute;left:60px;right:60px;bottom:135px;background:rgba(20,15,10,.82);border-radius:28px;padding:40px 44px;color:#fff;text-align:center}
.band h1{font-size:76px;color:#fff}
.band .sub{font-size:30px;font-weight:500;margin-top:12px;color:#EADBC4}
.band .pill{margin-top:28px}
.center{position:absolute;left:80px;right:80px;text-align:center}
.prod{position:absolute;left:50%;transform:translateX(-50%);mix-blend-mode:multiply}
.price{font-size:32px;font-weight:600;margin-top:14px;color:#4A3F33}
"""

LOGO = '<img class="logo" src="assets/logo.png">'
OFFER = 'Free studs on any order over $125'
DATES = 'Nov 2 to 25'


def page(name, body, bg='#F6F0E6', logo=True, logo_cls=''):
    lg = f'<img class="logo {logo_cls}" src="assets/logo.png">' if logo else ''
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>{name}</title>
<style>{CSS}</style></head><body style="--bg:{bg}">{body}{lg}</body></html>"""
    with open(os.path.join(HERE, name + '.html'), 'w', encoding='utf-8') as f:
        f.write(html)


ADS = {}

# 1. The Gold Link Set leads, studs second (offer-first, early-bird variant: product leads)
ADS['eb-01'] = dict(logo_cls='l', body=
    '<img class="bleed" src="assets/gold-link-set-0.png" style="object-position:50% 30%">'
    '<div class="band"><h1>The Gold Link Set</h1>'
    '<div class="sub">Necklace, bracelet and earrings. $249.</div>'
    f'<div class="pill light">{OFFER}</div><div class="date" style="color:#EADBC4">{DATES}</div></div>')

# 2. Lariat Heart Set, product on cream
ADS['eb-02'] = dict(body=
    '<div class="center" style="top:250px"><h1 style="font-size:84px">A heart she will<br>wear every day.</h1>'
    '<div class="price">Lariat Heart Set &middot; $169</div></div>'
    '<img class="prod" src="assets/lariat-heart-set-0.jpg" style="top:520px;width:600px">'
    f'<div class="center" style="bottom:150px"><div class="pill">{OFFER}</div><div class="date">{DATES}</div></div>')

# 3. Spiral Set clears the line on its own
ADS['eb-03'] = dict(logo_cls='l', body=
    '<img class="bleed" src="assets/spiral-earring-and-necklace-set-10.png" style="object-position:50% 25%">'
    '<div class="band"><h1>This set comes with<br>free studs.</h1>'
    '<div class="sub">Spiral Earring and Necklace Set, $149.<br>Any order over $125 gets a free pair, Nov 2 to 25.</div></div>')

# 4. Water Drop Set: just over the line
ADS['eb-04'] = dict(logo_cls='l', body=
    '<img class="bleed" src="assets/water-drop-earring-and-necklace-set-0.png" style="object-position:50% 20%">'
    '<div class="band"><h1>The Water Drop Set. $129.</h1>'
    '<div class="sub">That is over $125, so the studs are free.</div>'
    f'<div class="pill light">Free studs, {DATES}</div></div>')

# 5. Two gifts on the list, studs for you
ADS['eb-05'] = dict(body=
    '<div class="center" style="top:250px"><h1 style="font-size:80px">Two gifts on your list.<br><span class="gold">A free pair of studs for you.</span></h1></div>'
    '<div style="position:absolute;top:500px;left:90px;right:90px;display:flex;gap:30px">'
    '<figure style="flex:1;background:#fff;border-radius:24px;padding:20px;text-align:center"><img src="assets/gold-link-earrings-11.jpg" style="width:100%;height:360px;object-fit:contain"><figcaption style="font-size:27px;font-weight:600;margin-top:10px">Gold Link Earrings &middot; $79</figcaption></figure>'
    '<figure style="flex:1;background:#fff;border-radius:24px;padding:20px;text-align:center"><img src="assets/gold-letter-pendant-with-cuban-chain-11.jpg" style="width:100%;height:360px;object-fit:contain"><figcaption style="font-size:27px;font-weight:600;margin-top:10px">Gold Letter Pendant &middot; $89</figcaption></figure></div>'
    f'<div class="center" style="bottom:150px"><div class="pill">{OFFER}</div><div class="date">{DATES}</div></div>')

# 6. Proof: gold that stays gold (photo on top, words on cream below so the earrings stay whole)
ADS['eb-06'] = dict(logo=False, body=
    '<img src="assets/gold-link-earrings-2.jpg" style="position:absolute;top:0;left:0;width:1080px;height:780px;object-fit:cover;object-position:50% 30%">'
    '<div style="position:absolute;top:780px;left:0;right:0;bottom:0;background:#F6F0E6"></div>'
    '<div style="position:absolute;top:820px;left:80px;right:80px;display:flex;gap:40px;align-items:flex-start">'
    '<h1 style="font-size:72px;flex:1.1">Wear it every day.<br><span class="gold">It stays gold.</span></h1>'
    '<div style="flex:1;font-size:28px;font-weight:600;line-height:1.75;color:#4A3F33;padding-top:8px">18K gold over stainless steel<br>Tarnish free<br>Sweat proof<br>Won&rsquo;t turn your skin green</div></div>'
    f'<div class="center" style="bottom:140px;text-align:left"><div class="pill">{OFFER}</div><div class="date">{DATES}</div></div>'
    '<img src="assets/logo.png" style="position:absolute;right:80px;bottom:190px;height:48px">')

# 7. Review over product (real review, iceandgold.com)
ADS['eb-07'] = dict(logo_cls='l', body=
    '<img class="bleed" src="assets/gold-link-set-3.png" style="object-position:50% 30%">'
    '<div class="band"><div style="font-size:36px;letter-spacing:8px;color:#F3D9A4">&#9733;&#9733;&#9733;&#9733;&#9733;</div>'
    '<h1 style="font-size:58px;font-style:italic;margin-top:10px">"The packaging was as impressive as the necklace itself."</h1>'
    '<div class="sub" style="font-size:24px">Zaylee, Ice &amp; Gold customer</div>'
    f'<div class="pill light">{OFFER}</div><div class="date" style="color:#EADBC4">{DATES}</div></div>')

# 8. His chain is on your list
ADS['eb-08'] = dict(logo_cls='l', bg='#141210', body=
    '<img class="bleed" src="assets/12mm-diamond-clasps-gold-cuban-set-3.jpg" style="object-position:50% 50%">'
    '<div class="band"><h1>His chain is on your list.</h1>'
    '<div class="sub">12mm Diamond Clasps Gold Cuban Set, $249.<br>The free studs are for you.</div>'
    f'<div class="pill light">{OFFER}</div><div class="date" style="color:#EADBC4">{DATES}</div></div>')

# 9. Native phone: the gift list in Notes
NOTE = ('<div style="position:absolute;top:170px;left:130px;right:130px;background:#fff;border-radius:40px;'
        'box-shadow:0 30px 80px rgba(60,40,10,.18);padding:56px 60px 50px;font-family:-apple-system,Inter,Arial,sans-serif">'
        '<div style="font-size:24px;color:#D69A2D;font-weight:600">&lsaquo; Notes</div>'
        '<div style="font-size:52px;font-weight:800;margin:22px 0 30px">Christmas list</div>'
        + ''.join(f'<div style="display:flex;gap:22px;align-items:flex-start;font-size:36px;line-height:1.3;margin:0 0 26px">'
                  f'<span style="flex:none;width:40px;height:40px;border-radius:50%;border:3px solid {"#D69A2D" if c else "#bbb"};'
                  f'background:{"#D69A2D" if c else "transparent"};margin-top:4px"></span><span>{t}</span></div>'
                  for t, c in [('Mom: Water Drop Set ($129)', True), ('Sis: Gold Link Earrings ($79)', True),
                               ('Auntie: Lariat Heart Set ($169)', False),
                               ('Me: the free studs (Ice &amp; Gold, any order over $125)', False)])
        + '</div>')
THUMBS = ('<div style="position:absolute;top:905px;left:130px;right:130px;display:flex;gap:24px">'
          + ''.join(f'<div style="flex:1;height:200px;border-radius:24px;overflow:hidden;background:#fff">'
                    f'<img src="assets/{f}" style="width:100%;height:100%;object-fit:cover"></div>'
                    for f in ['water-drop-earring-and-necklace-set-2.jpg', 'gold-link-earrings-11.jpg', 'lariat-heart-set-0.jpg'])
          + '</div>')
ADS['eb-09'] = dict(logo=False, bg='#EFE6D8', body=NOTE + THUMBS +
    '<div class="center" style="bottom:150px;font-size:26px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#4A3F33">'
    'Free studs over $125 &middot; Nov 2 to 25</div>')

def main():
    for name, a in ADS.items():
        page(name, a['body'], bg=a.get('bg', '#F6F0E6'), logo=a.get('logo', True), logo_cls=a.get('logo_cls', ''))
    print('wrote', len(ADS))


if __name__ == '__main__':
    main()
