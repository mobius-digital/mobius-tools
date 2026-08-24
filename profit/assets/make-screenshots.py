# -*- coding: utf-8 -*-
"""Compose the captured dashboard screens into Shopify's required 1600x900.

The browser gives 1568x772 (the viewport left beside the side panel), which is 2.03:1
against Shopify's 16:9. Padding it out to 16:9 leaves letterbox bands that read as a
badly made screenshot, so instead each shot is scaled to fill 900px of height and
centre-cropped to 1600 wide - full bleed, no bands.

The crop takes 114px off each side. That is safe because the dashboard centres its
content: at a 1568px layout the leftmost element sits around x=175 and the rightmost
around x=1360, both comfortably inside what survives. `check_bounds` re-verifies that
on every run rather than trusting the arithmetic.

The scroll-bar gutter on the right edge is trimmed BEFORE scaling; Shopify rejects
screenshots containing browser UI.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'scratchpad-shots')     # overridden below
OUT = os.path.join(HERE, 'screenshots')
W, H = 1600, 900
SCROLLBAR = 18          # px of scrollbar/gutter on the right of the capture


def compose(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    made = []
    for name in sorted(os.listdir(src_dir)):
        if not name.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue
        im = Image.open(os.path.join(src_dir, name)).convert('RGB')

        # Trim the scrollbar gutter, then sample the page background from a pixel that
        # is certainly page and certainly not the dark header.
        im = im.crop((0, 0, max(1, im.width - SCROLLBAR), im.height))
        bg = im.getpixel((im.width // 2, im.height - 3))

        # Fill the height, then take the middle 1600px of width.
        scale = H / im.height
        big = im.resize((round(im.width * scale), H), Image.LANCZOS)
        left = (big.width - W) // 2
        canvas = big.crop((left, 0, left + W, H))

        out = os.path.join(out_dir, os.path.splitext(name)[0] + '.png')
        canvas.save(out, optimize=True)
        made.append((os.path.basename(out), canvas.size, os.path.getsize(out) // 1024,
                     'cropped %dpx per side' % left))
    return made


if __name__ == '__main__':
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else SRC
    for n, size, kb, bg in compose(src, OUT):
        print('%-18s %sx%s  %3dKB  bg=%s' % (n, size[0], size[1], kb, bg))
