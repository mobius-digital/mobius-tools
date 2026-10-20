# Colour grade for dull AI scenes (Cole 2026-10-20: "some of your boxes look super dull and don't look good together").
# A natural edit, like a good phone-photo edit: levels stretch, gentle S-curve, VIBRANCE (lifts muted colours most, leaves
# already-strong ones alone, so the box prints pop together without going neon), a touch of warmth, and local clarity.
# python hw/grade.py <ids...>   reads gpt/<id>-out.png, keeps the untouched original in gpt/_raw/<id>-out.png (once),
# writes the graded image back to gpt/<id>-out.png so every builder picks it up. Re-running grades from the original.
import os, sys, shutil
import numpy as np
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); G = os.path.join(HERE, 'gpt'); RAW = os.path.join(G, '_raw')
os.makedirs(RAW, exist_ok=True)

def rgb2hsv(a):
    mx = a.max(-1); mn = a.min(-1); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    return mx, mn, s

def grade(im, vib=0.55, curve=0.10, warm=0.015, clarity=28, stretch=0.75):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    lum = a @ np.array([.299, .587, .114], np.float32)
    lo, hi = np.percentile(lum, [0.8, 99.6])
    st = np.clip((a - lo) / max(hi - lo, 1e-3), 0, 1)
    a = a * (1 - stretch) + st * stretch                                  # levels, partly
    a = a + curve * np.sin(np.pi * (a - .5)) * .5 * 2 / np.pi * np.pi / 2 * (a * (1 - a)) * 4  # soft S-curve, strongest in mid tones
    a = np.clip(a, 0, 1)
    mx, mn, s = rgb2hsv(a)
    l = a.mean(-1, keepdims=True)
    boost = 1 + vib * (1 - s)[..., None] * (1 - np.abs(l - .5) * 1.2).clip(0, 1)   # muted mid-tone colours gain most
    a = np.clip(l + (a - l) * boost, 0, 1)
    a[..., 0] *= 1 + warm; a[..., 2] *= 1 - warm                        # a touch warmer
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return out.filter(ImageFilter.UnsharpMask(radius=24, percent=clarity, threshold=2))  # local clarity

if __name__ == '__main__':
    for i in sys.argv[1:]:
        src = os.path.join(G, f'{i}-out.png'); raw = os.path.join(RAW, f'{i}-out.png')
        if not os.path.exists(raw): shutil.copy(src, raw)
        grade(Image.open(raw)).save(src); print('graded', i)
