"""Bonk "Floyd style" ads: AI scene + AI 3D headline (Locus Studio make-exact, then change), the REAL hat photo
(cut out by cutout.py) placed in the empty spot with a soft contact shadow, and the offer bar set in code so
prices are exact. The AI never draws a hat, a person or a logo.

4:5: Studio extend paints sky/ground above and below the square (scenes/<name>-ext.png, 1024x1280); the original
square goes back on top with feathered edges at y 135..1215, so every AI word is inside the 1:1 safe zone.
Writes ai-XX.html; render.ps1 renders them. Run: python ai_build.py
"""
import os
from bf_build import PRICE, VALUE

HERE = os.path.dirname(os.path.abspath(__file__))
K = 1080 / 1024  # square px -> 4:5 px (the square sits at y 135..1215, the 1:1 safe zone)
Y0 = 135

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden;background:#000}
.ext{position:absolute;left:0;top:0;width:1080px;height:1350px}
.scene{position:absolute;left:0;top:135px;width:1080px;height:1080px;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 26px,#000 1054px,transparent 1080px)}
.shadow{position:absolute;border-radius:50%;filter:blur(18px)}
.hat{position:absolute;object-fit:contain;object-position:50% 100%}
.bar{position:absolute;left:70px;right:70px;top:1078px;height:120px;display:flex;align-items:center;justify-content:space-between;
  border-top:2px solid var(--line);padding-top:14px;font-family:Anton,Impact,sans-serif;color:var(--ink)}
.bar .off{font-size:44px;line-height:1.05;letter-spacing:.5px;text-transform:uppercase}
.bar .off small{display:block;font-family:Inter,Arial,sans-serif;font-weight:700;font-size:24px;letter-spacing:.3px;text-transform:none;opacity:.85;margin-top:6px}
.bar .btn{font-family:Inter,Arial,sans-serif;font-weight:800;font-size:26px;letter-spacing:1.5px;text-transform:uppercase;
  background:var(--btn);color:var(--btnink);padding:18px 30px;border-radius:12px;white-space:nowrap}
.fade{position:absolute;left:0;right:0;top:960px;height:390px;background:linear-gradient(180deg,transparent,var(--fade) 45%)}
"""

B2G1 = ('Buy 2 hats, get 1 free', 'Black Friday, Nov 27 to 30')
SET = (f'{VALUE} of gear for {PRICE}', 'Hat, ball marker, divot tool, towel and tees')

ADS = {
    # key: (scene png, hat cutout, box in square px (x, y, w, h), offer (big, small), theme)
    'ai-01': ('smoke.png', 'smoke-show-0.png', (222, 400, 580, 390), B2G1, dict(ink='#fff', line='rgba(255,255,255,.35)', btn='#fff', btnink='#111', fade='rgba(0,0,0,.82)')),
    'ai-02': ('bb.png', 'breakfast-ball-snapback-0.png', (222, 400, 580, 390), B2G1, dict(ink='#fff', line='rgba(255,255,255,.5)', btn='#e8417a', btnink='#fff', fade='rgba(176,40,92,.88)')),
    'ai-03': ('dunes.png', 'dunes-day-0.png', (222, 400, 580, 390), B2G1, dict(ink='#fff', line='rgba(255,255,255,.45)', btn='#fff', btnink='#5a4220', fade='rgba(70,48,20,.82)')),
    'ai-04': ('box.png', 'smoke-show-golf-gift-set-0.png', (250, 330, 524, 480), SET, dict(ink='#fff', line='rgba(255,255,255,.35)', btn='#c8f031', btnink='#111', fade='rgba(0,0,0,.85)')),
}


FIT = {'ai-01': (1.04, 34), 'ai-04': (0.9, 70)}  # per ad: (grow, push down px) so the product never touches the words


def page(name, scene, hat, box, offer, theme):
    x, y, w, h = box
    L, T, W, H = x * K, y * K + Y0, w * K, h * K
    g, dy = FIT.get(name, (1.12, 0))  # a touch bigger, grown from the bottom centre
    L, T, W, H = L - W * (g - 1) / 2, T - H * (g - 1) + dy, W * g, H * g
    vars_ = ';'.join(f'--{k}:{v}' for k, v in theme.items())
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>{name}</title><style>{CSS}</style></head>
<body style="{vars_}"><img class="ext" src="scenes/{scene[:-4]}-ext.png"><img class="scene" src="scenes/{scene}">
<div class="shadow" style="left:{L + W * .12:.0f}px;top:{T + H - 34:.0f}px;width:{W * .76:.0f}px;height:60px;background:rgba(0,0,0,.55)"></div>
<img class="hat" src="assets/cut/{hat}" style="left:{L:.0f}px;top:{T:.0f}px;width:{W:.0f}px;height:{H:.0f}px">
<div class="fade"></div>
<div class="bar"><div class="off">{offer[0]}<small>{offer[1]}</small></div><div class="btn">Shop now</div></div>
</body></html>"""
    with open(os.path.join(HERE, name + '.html'), 'w', encoding='utf-8') as f:
        f.write(html)


if __name__ == '__main__':
    for name, (scene, hat, box, offer, theme) in ADS.items():
        if os.path.exists(os.path.join(HERE, 'scenes', scene[:-4] + '-ext.png')):
            page(name, scene, hat, box, offer, theme); print('wrote', name)
        else:
            print('no scene yet', name)
