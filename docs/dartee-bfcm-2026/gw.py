# Game of Belts giveaway +5 (G12-G16): ChatGPT scale scenes (gpt/<id>-out.png, 1024x1536) + words in code.
# python hw/gw.py [ids]
import os, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import dt
from dt import logo
from PIL import Image
G = os.path.join(os.path.dirname(HERE), 'gpt')

def scene(i):
    im = Image.open(os.path.join(G, f'{i}-out.png')).convert('RGB').resize((1024, 1536)).crop((0, 128, 1024, 1408))
    im.save(os.path.join(dt.A, f'gw-{i}.png'))

SH = 'linear-gradient(180deg,rgba(0,0,0,.78) 0%,rgba(0,0,0,.6) 30%,rgba(0,0,0,.15) 50%,rgba(0,0,0,0) 62%,rgba(0,0,0,0) 100%)'
def ad(i, head, size=130, low=False):
    scene(i)
    if low == 'bottom': return bottom_ad(i, head, size)
    if low: return low_ad(i, head, size)
    return (f'<img class="p" src="../a/gw-{i}.png" style="left:0;top:0;width:1080px;height:1350px"><div class="p" style="left:0;top:0;width:1080px;height:1350px;background:{SH}"></div>'
            + logo(72, 150, 36) + '<div class="t mono" style="right:72px;top:156px;color:#F2EFE8">The Game of Belts</div>'
            + '<div class="t" style="left:72px;width:936px;top:224px;display:flex;flex-direction:column;align-items:flex-start;gap:22px">'
            + f'<div class="disp" style="font-size:{size}px;text-shadow:0 4px 30px rgba(0,0,0,.5)">{head}</div>'
            + '<div style="font-family:BC;text-transform:uppercase;font-size:40px;line-height:1;color:#fff">25 belts for you &nbsp;·&nbsp; 25 for your buddy</div>'
            + '<div style="padding:13px 22px 11px;background:#15C3B0;color:#06231f;font-family:Mono;font-size:24px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;white-space:nowrap">$4,500 of belts &nbsp;·&nbsp; free to enter &nbsp;·&nbsp; ends Nov 16</div></div>')

LINE = '<div style="font-family:BC;text-transform:uppercase;font-size:40px;line-height:1;color:#fff">25 belts for you &nbsp;·&nbsp; 25 for your buddy</div>'
BAR = '<div style="padding:13px 22px 11px;background:#15C3B0;color:#06231f;font-family:Mono;font-size:24px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;white-space:nowrap">$4,500 of belts &nbsp;·&nbsp; free to enter &nbsp;·&nbsp; ends Nov 16</div>'
def low_ad(i, head, size):
    sh = 'linear-gradient(180deg,rgba(0,0,0,.6) 0%,rgba(0,0,0,.3) 24%,rgba(0,0,0,0) 36%,rgba(0,0,0,0) 74%,rgba(0,0,0,.7) 92%,rgba(0,0,0,.8) 100%)'
    return (f'<img class="p" src="../a/gw-{i}.png" style="left:0;top:0;width:1080px;height:1350px"><div class="p" style="left:0;top:0;width:1080px;height:1350px;background:{sh}"></div>'
            + logo(72, 150, 36) + '<div class="t mono" style="right:72px;top:156px;color:#F2EFE8">The Game of Belts</div>'
            + f'<div class="t disp" style="left:72px;width:936px;top:214px;font-size:{size}px;text-shadow:0 4px 30px rgba(0,0,0,.5)">{head}</div>'
            + f'<div class="t" style="left:72px;width:936px;top:1085px;display:flex;flex-direction:column;align-items:center;gap:18px">{LINE}{BAR}</div>')

def bottom_ad(i, head, size):
    """Every word on the bottom third (the picture's subject is up top)."""
    sh = 'linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 18%,rgba(0,0,0,0) 48%,rgba(0,0,0,.55) 66%,rgba(0,0,0,.82) 100%)'
    return (f'<img class="p" src="../a/gw-{i}.png" style="left:0;top:0;width:1080px;height:1350px"><div class="p" style="left:0;top:0;width:1080px;height:1350px;background:{sh}"></div>'
            + logo(72, 150, 36) + '<div class="t mono" style="right:72px;top:156px;color:#F2EFE8">The Game of Belts</div>'
            + '<div class="t" style="left:72px;width:936px;top:800px;display:flex;flex-direction:column;align-items:flex-start;gap:22px">'
            + f'<div class="disp" style="font-size:{size}px;text-shadow:0 4px 30px rgba(0,0,0,.5)">{head}</div>{LINE}{BAR}</div>')

ADS = {
 'G12': ('Win 50 belts.', 150),
 'G13': ('Bring the cart.', 150),
 'G14': ('Your buddy<br>owes you one.', 118, 'bottom'),
 'G15': ('Where do you<br>put 50 belts?', 130),
 'G16': ('Fifty belts.<br>Two winners.', 130),
}
if __name__ == '__main__':
    for i in (sys.argv[1:] or list(ADS)):
        if os.path.exists(os.path.join(G, f'{i}-out.png')):
            dt.render(f'DT-GW26-{i}', ad(i, *ADS[i]), bg='#000')
