# -*- coding: utf-8 -*-
"""Rebuild the Mobius mark at 1200x1200 for the Shopify app icon.

The only brand asset that exists is a 128px favicon, and 128 -> 1200 is a 9.4x
upscale that no resampler survives. So the mark is reconstructed from geometry
MEASURED off that favicon (bar positions, widths, lengths, corner radius and the
gradient stops all came from sampling it), then verified by downscaling the result
back to 128 and diffing against the original.
"""
import numpy as np
from PIL import Image
import os

OUT = os.path.dirname(os.path.abspath(__file__))
SRC = r'C:\Users\wetzl\OneDrive\Apps\Desktop\Mobius Digital\Mobius Digital Tools\favicon.png'

N = 128.0          # the space every measurement below is in
SIZE = 1200
SS = 3             # supersample factor
S = SIZE * SS
k = S / N          # 128-space -> pixel scale

BG = np.array([12, 22, 29], dtype=float)
CORNER_R = 23.0    # measured: left edge reached at y=23

# Bars, as measured. Ranges are in (x+y) for the perpendicular axis and (x-y)
# along the bar; both were read straight off the favicon's solid pixels.
BARS = [
    dict(perp=(97, 126), along=(-62, 32)),
    dict(perp=(131, 160), along=(-31, 61)),
    # The tail is NOT a plain capsule: its lower-left end is a round cap, but its
    # upper-right end is cut by a straight vertical edge at x=106 (measured: the
    # right side is a flat line from y=61 to y=87). That vertical cut is what makes
    # the mark read as an M rather than three loose bars.
    dict(perp=(165, 192), along=(0, 400), clip_x=106.0),
]

# Gradient across x, sampled from the brightest pixel in each column.
STOPS = [(22.0, (186, 229, 225)), (64.0, (119, 197, 231)), (106.0, (216, 201, 175))]

R2 = np.sqrt(2.0)

xs = (np.arange(S) + 0.5) / k                     # 128-space coords of each pixel
X = xs[None, :].repeat(S, 0)
Y = xs[:, None].repeat(S, 1)


def rounded_rect_mask(w, h, r):
    """Signed coverage for a rounded rectangle filling the whole canvas."""
    cx = np.minimum(X, w - X)
    cy = np.minimum(Y, h - Y)
    # distance OUTSIDE the shape, negative inside
    dx = np.maximum(r - cx, 0)
    dy = np.maximum(r - cy, 0)
    corner = np.sqrt(dx ** 2 + dy ** 2)
    d = np.where((cx < r) & (cy < r), corner - r, -np.minimum(cx, cy))
    return np.clip(0.5 - d * k, 0, 1)             # 1px-wide antialiased edge


def capsule_mask(perp, along, clip_x=None):
    """A 45-degree bar with round caps.

    u is the axis perpendicular to the bar, v runs along it. The measured `along`
    range includes the caps, so the centerline is inset by the radius at each end.
    """
    u = (X + Y) / R2
    v = (X - Y) / R2
    u0, u1 = perp[0] / R2, perp[1] / R2
    rad = (u1 - u0) / 2.0
    uc = (u0 + u1) / 2.0
    v0 = along[0] / R2 + rad
    v1 = along[1] / R2 - rad
    vc = np.clip(v, v0, v1)                       # nearest point on the centerline
    d = np.sqrt((u - uc) ** 2 + (v - vc) ** 2) - rad
    a = np.clip(0.5 - d * k, 0, 1)
    if clip_x is not None:
        a = np.minimum(a, np.clip(0.5 - (X - clip_x) * k, 0, 1))
    return a


def gradient_rgb():
    """Linear gradient across x through the three measured stops."""
    out = np.zeros((S, S, 3), dtype=float)
    pos = [p for p, _ in STOPS]
    cols = [np.array(c, dtype=float) for _, c in STOPS]
    xg = np.clip(X, pos[0], pos[-1])
    for i in range(len(STOPS) - 1):
        lo, hi = pos[i], pos[i + 1]
        t = np.clip((xg - lo) / (hi - lo), 0, 1)
        seg = (xg >= lo) & (xg <= hi)
        blend = cols[i][None, None, :] * (1 - t)[..., None] + cols[i + 1][None, None, :] * t[..., None]
        out = np.where(seg[..., None], blend, out)
    return out


print('building at %dx%d (%dx supersample)...' % (S, S, SS))
bg_a = rounded_rect_mask(N, N, CORNER_R)
mark_a = np.zeros((S, S))
for b in BARS:
    mark_a = np.maximum(mark_a, capsule_mask(b['perp'], b['along'], b.get('clip_x')))
mark_a *= bg_a                                    # never spill past the rounded corner

rgb = BG[None, None, :] * np.ones((S, S, 1))
rgb = rgb * (1 - mark_a[..., None]) + gradient_rgb() * mark_a[..., None]

img = np.concatenate([rgb, (bg_a * 255)[..., None]], axis=2)
im = Image.fromarray(np.clip(img, 0, 255).astype('uint8'), 'RGBA')
im = im.resize((SIZE, SIZE), Image.LANCZOS)

# The App Store icon is shown on light and dark surfaces, so it must not rely on
# page background showing through: flatten onto the brand navy.
flat = Image.new('RGB', (SIZE, SIZE), tuple(int(c) for c in BG))
flat.paste(im, (0, 0), im)

p_rgba = os.path.join(OUT, 'app-icon-1200.png')
im.save(p_rgba)
p_flat = os.path.join(OUT, 'app-icon-1200-flat.png')
flat.save(p_flat)
print('wrote', p_rgba, os.path.getsize(p_rgba), 'bytes')
print('wrote', p_flat, os.path.getsize(p_flat), 'bytes')

# ---- verify against the original ----
orig = Image.open(SRC).convert('RGBA')
mine = im.resize((128, 128), Image.LANCZOS)
a = np.asarray(orig, dtype=float)
b = np.asarray(mine, dtype=float)
# compare only where the original is opaque, over RGB
m = a[..., 3] > 250
diff = np.abs(a[..., :3][m] - b[..., :3][m])
print('\nvs original favicon (128px, opaque pixels only):')
print('  mean abs channel diff: %.1f / 255' % diff.mean())
print('  p95 abs channel diff : %.1f / 255' % np.percentile(diff, 95))
side = Image.new('RGB', (128 * 2 + 12, 128), (255, 255, 255))
side.paste(orig.convert('RGB'), (0, 0))
side.paste(mine.convert('RGB'), (140, 0))
side = side.resize((side.width * 3, side.height * 3), Image.NEAREST)
p_cmp = os.path.join(OUT, 'compare.png')
side.save(p_cmp)
print('wrote', p_cmp)
