# Trace a character PNG's silhouette into an SVG path, so the vector character
# (src/marks/Toon.tsx) keeps the rendered one's exact outline.
#
#   python3 scripts/trace-character.py ../logo/cashew/character/rest.png
#
# Prints a path in the PNG's own 200 unit box: the alpha edge, upsampled 4x,
# traced, thinned and smoothed into cubic curves.
import sys
import numpy as np
from PIL import Image

def trace(mask):
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    i = np.lexsort((xs, ys))[0]
    start = (ys[i], xs[i])
    dirs = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    pts = [start]
    cur, d = start, 6
    for _ in range(200000):
        for k in range(8):
            nd = (d + k) % 8
            y, x = cur[0] + dirs[nd][0], cur[1] + dirs[nd][1]
            if 0 <= y < h and 0 <= x < w and mask[y, x]:
                cur = (y, x)
                d = (nd + 5) % 8
                break
        if cur == start:
            break
        pts.append(cur)
    return np.array([(x, y) for y, x in pts], float)

def rdp(p, eps):
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    ab = b - a
    n = np.hypot(*ab) or 1
    q = p - a
    d = np.abs(ab[0] * q[:, 1] - ab[1] * q[:, 0]) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(p[: i + 1], eps)[:-1], rdp(p[i:], eps)])
    return np.array([a, b])

def main(path, scale=4, eps=1.6):
    im = Image.open(path).convert('RGBA')
    big = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    mask = np.array(big)[..., 3] > 128
    pts = trace(mask) / scale
    # smooth the staircase a little, then thin
    k = 5
    pad = np.vstack([pts[-k:], pts, pts[:k]])
    sm = np.array([pad[i : i + 2 * k + 1].mean(0) for i in range(len(pts))])
    h = len(sm) // 2
    e = eps / scale * 2
    simp = np.vstack([rdp(sm[: h + 1], e)[:-1], rdp(np.vstack([sm[h:], sm[:1]]), e)[:-1]])
    n = len(simp)
    out = [f'M{simp[0][0]:.1f} {simp[0][1]:.1f}']
    for i in range(n):
        p0, p1, p2, p3 = simp[(i - 1) % n], simp[i], simp[(i + 1) % n], simp[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6
        c2 = p2 - (p3 - p1) / 6
        out.append(f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}')
    print(''.join(out) + 'Z')
    print(f'// {n} points', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1])
