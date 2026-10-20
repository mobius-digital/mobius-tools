# Words on the new ChatGPT scenes of 2026-10-20: Early Bird E19, E20 (giveaway G17, G18 live in gw.py's lockup).
# python hw/fillai.py [ids]
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
import dt, aiads
from PIL import Image
G = os.path.join(os.path.dirname(HERE), 'gpt')
SH = 'linear-gradient(180deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.45) 28%,rgba(0,0,0,.06) 44%,rgba(0,0,0,0) 56%,rgba(0,0,0,0) 80%,rgba(0,0,0,.6) 100%)'
TS = 'text-shadow:0 4px 30px rgba(0,0,0,.6)'
TEAL = '#5FE3D3'
BOT = 'Second belt 50% off &nbsp;·&nbsp; Nov 1 to 16'

def prep(i):
    im = Image.open(os.path.join(G, f'{i}-out.png')).convert('RGB').resize((1024, 1536), Image.LANCZOS)
    im.crop((0, 128, 1024, 1408)).save(os.path.join(G, f'{i}.png')); open(os.path.join(G, f'{i}.json'), 'w').write('[]')
def bc(head, sub='', size=120):
    s = f'<div class="t disp" style="left:72px;width:936px;top:230px;font-size:{size}px;{TS}">{head}</div>'
    if sub: s += f'<div class="t" style="left:72px;width:880px;top:{230 + int(size * .86 * (head.count("<br>") + 1)) + 26}px;font-family:BarM;font-size:36px;line-height:1.3;color:#F2EFE8;{TS}">{sub}</div>'
    return s
def serif(head, sub='', size=84):
    s = f'<div class="t" style="left:72px;width:936px;top:232px;font-family:Playfair,Georgia,serif;font-style:italic;font-size:{size}px;line-height:1.12;color:#fff;{TS}">{head}</div>'
    if sub: s += f'<div class="t mono" style="left:72px;width:936px;top:{232 + int(size * 1.12 * (head.count("<br>") + 1)) + 26}px;color:#F2EFE8">{sub}</div>'
    return s
E = lambda t: f'<span style="color:{TEAL}">{t}</span>'
ADS = {
 'E19': lambda: aiads.frame('E19', bc('Two belts.<br>' + E('One tee time.'), 'Buy one, the second is half off. $148.50 for both.', 128), shade=SH, name='Early Bird', bottom=BOT),
 'E20': lambda: aiads.frame('E20', serif('The early bird<br>gets the second belt.', 'Half off, any two belts &nbsp;·&nbsp; through Nov 16', 88), shade=SH, name='Early Bird', bottom=BOT),
}
if __name__ == '__main__':
    for i in (sys.argv[1:] or list(ADS)):
        if os.path.exists(os.path.join(G, f'{i}-out.png')): prep(i); dt.render(f'DT-EB26-{i}', ADS[i](), bg='#000')
        else: print(i, 'no scene yet')
