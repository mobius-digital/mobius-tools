# Cyber Monday + Lizard, Nov 30 to Dec 4: words on the 8 ChatGPT scenes (M09-M16). python hw/cyberai.py [ids]
# Scenes rendered in from the store photo (no pin), cropped from gpt/<id>-out.png by prep(). M11 is the Lizard tease: no belt in it on
# purpose (the Lizard has no photo yet, Oct 20). Accent: cyber blue, same as hw/cyber.py.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
import dt, aiads
from PIL import Image
G = os.path.join(os.path.dirname(HERE), 'gpt')
SH = 'linear-gradient(180deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.48) 28%,rgba(0,0,0,.08) 44%,rgba(0,0,0,0) 56%,rgba(0,0,0,0) 80%,rgba(0,0,0,.6) 100%)'
TS = 'text-shadow:0 4px 30px rgba(0,0,0,.6)'
BLUE = '#7FDBFF'
BOT = 'Free Raincheck with every order &nbsp;·&nbsp; through Dec 4'
TOP = {}

def prep(i):
    im = Image.open(os.path.join(G, f'{i}-out.png')).convert('RGB').resize((1024, 1536), Image.LANCZOS)
    t = TOP.get(i, 128); im.crop((0, t, 1024, t + 1280)).save(os.path.join(G, f'{i}.png'))
    open(os.path.join(G, f'{i}.json'), 'w').write('[]')

def bc(head, sub='', size=120):
    s = f'<div class="t disp" style="left:72px;width:936px;top:230px;font-size:{size}px;{TS}">{head}</div>'
    if sub: s += f'<div class="t" style="left:72px;width:880px;top:{230 + int(size * .86 * (head.count("<br>") + 1)) + 26}px;font-family:BarM;font-size:36px;line-height:1.3;color:#F2EFE8;{TS}">{sub}</div>'
    return s
def serif(head, sub='', size=84):
    s = f'<div class="t" style="left:72px;width:936px;top:232px;font-family:Playfair,Georgia,serif;font-style:italic;font-size:{size}px;line-height:1.12;color:#fff;{TS}">{head}</div>'
    if sub: s += f'<div class="t mono" style="left:72px;width:936px;top:{232 + int(size * 1.12 * (head.count("<br>") + 1)) + 26}px;color:#F2EFE8">{sub}</div>'
    return s
def sticker(head, sub='', bg=BLUE):
    return (f'<div class="t" style="left:72px;top:236px;padding:18px 30px 14px;background:{bg};color:#06231f;font-family:BCX;text-transform:uppercase;font-size:88px;line-height:.9;transform:rotate(-2deg);box-shadow:0 20px 40px rgba(0,0,0,.4)">{head}</div>'
            + (f'<div class="t" style="left:72px;width:880px;top:420px;font-family:BarM;font-size:36px;line-height:1.3;color:#F2EFE8;{TS}">{sub}</div>' if sub else ''))
def ad(i, inner, name, bottom=BOT): return aiads.frame(i, inner, shade=SH, name=name, bottom=bottom)
E = lambda t: f'<span style="color:{BLUE}">{t}</span>'
ADS = {
 'M09': lambda: ad('M09', bc('Back at work.<br>' + E('Still on sale.'), 'Black Friday did not end Sunday. Through Thursday.', 120), 'Sahara Sunset'),
 'M10': lambda: ad('M10', bc('Cyber Monday.<br>' + E('We had to.'), size=140), 'Midnight Black Caiman'),
 'M11': lambda: ad('M11', bc('The Lizard<br>drops at 9.', 'New belt, $120, not on sale. The line formed earlier.', 130), 'Monday, Nov 30', bottom='The Lizard &nbsp;·&nbsp; $120 &nbsp;·&nbsp; never discounted'),
 'M12': lambda: ad('M12', serif('Monday league.<br>Showed up in the new one.', 'Gulf Stream, $99 &nbsp;·&nbsp; a Raincheck free with it', 80), 'Gulf Stream'),
 'M13': lambda: ad('M13', bc('Still here.<br>' + E('Still on sale.'), 'Bone Dry, $99. The free Raincheck comes with it until Dec 4.', 130), 'Bone Dry'),
 'M14': lambda: ad('M14', sticker('Monday<br>commute', 'Free Raincheck still in the cart. Up to 50% off until Thursday.'), 'Volcanic Ash'),
 'M15': lambda: ad('M15', bc('Order Monday.<br>' + E('On by Saturday.'), 'Ships within 24 hours from Charleston. Two belts in the box.', 118), 'Carolina Croc'),
 'M16': lambda: ad('M16', serif('Added to cart.<br>From the office.', 'The sale stays through Dec 4 &nbsp;·&nbsp; 50 Shades of Gator, $99', 84), 'Cyber Monday'),
}
if __name__ == '__main__':
    for i in (sys.argv[1:] or list(ADS)):
        if os.path.exists(os.path.join(G, f'{i}-out.png')): prep(i); dt.render(f'DT-CM26-{i}', ADS[i](), bg='#000')
        else: print(i, 'no scene yet')
