# Gift cards, Dec 21 to 24: words on the 4 ChatGPT scenes (K05-K08). python hw/giftcardai.py [ids]
# The card itself is a/giftcard.png (drawn in hw/giftcard.py) and was ChatGPT's reference, so its words are ours. No bonus is
# promised: darteegolf.com sells no gift card yet and the matched offer is a draft.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
import dt, aiads
from PIL import Image
G = os.path.join(os.path.dirname(HERE), 'gpt')
SH = 'linear-gradient(180deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.48) 28%,rgba(0,0,0,.08) 44%,rgba(0,0,0,0) 56%,rgba(0,0,0,0) 80%,rgba(0,0,0,.6) 100%)'
TS = 'text-shadow:0 4px 30px rgba(0,0,0,.6)'
TEAL = '#5FE3D3'
BOT = 'Digital gift card &nbsp;·&nbsp; arrives by email in seconds'
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
def ad(i, inner, name, bottom=BOT): return aiads.frame(i, inner, shade=SH, name=name, bottom=bottom)
E = lambda t: f'<span style="color:{TEAL}">{t}</span>'
ADS = {
 'K05': lambda: ad('K05', bc('11:58pm.<br>' + E('Still counts.'), 'Print it, slide it under the door, or let the email do it.', 130), 'Dec 24'),
 'K06': lambda: ad('K06', serif('He picks the colour.<br>You get the credit.', 'Any belt, any size &nbsp;·&nbsp; cut once to fit', 82), 'Gift card'),
 'K07': lambda: ad('K07', bc('Sent at 9:14.<br>' + E('Landed at 9:14.'), 'A Dartee gift card arrives by email in seconds. He picks the belt.', 120), 'Dec 24'),
 'K08': lambda: ad('K08', bc('You forgot someone.<br>' + E('It happens.'), 'Gift card in the card. Looks like you planned it.', 110), 'Gift card'),
}
if __name__ == '__main__':
    for i in (sys.argv[1:] or list(ADS)):
        if os.path.exists(os.path.join(G, f'{i}-out.png')): prep(i); dt.render(f'DT-GC26-{i}', ADS[i](), bg='#000')
        else: print(i, 'no scene yet')
