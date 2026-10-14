"""Make each studio photo's backdrop pure white (flat-field: divide by a smooth backdrop fitted to the border),
so a photo placed on a white ad has no visible edge or box. Nothing is drawn or removed; the shadows stay.
Writes assets/flat/<name>.jpg. Run: python flatten.py"""
import os, glob
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'assets'); DST = os.path.join(SRC, 'flat')


def backdrop(a):
    h, w, _ = a.shape; b = 10
    ys, xs = np.mgrid[0:h, 0:w]; u, v = xs / w, ys / h
    m = np.zeros((h, w), bool); m[:b] = m[-b:] = True; m[:, :b] = m[:, -b:] = True
    feats = lambda U, V: np.stack([np.ones_like(U), U, V, U * U, V * V, U * V], -1)
    X = feats(u[m], v[m]); A = feats(u, v).reshape(-1, 6)
    return np.stack([(A @ np.linalg.lstsq(X, a[..., c][m], rcond=None)[0]).reshape(h, w) for c in range(3)], -1)


if __name__ == '__main__':
    os.makedirs(DST, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(SRC, '*.*'))):
        n = os.path.splitext(os.path.basename(f))[0]
        if n in ('logo', 'performer-bundle-0'): continue
        if n.startswith('smoke-show-golf-gift-set-') and n != 'smoke-show-golf-gift-set-0':
            Image.open(f).convert('RGB').save(os.path.join(DST, n + '.jpg'), quality=93); continue  # full-frame shots: no backdrop
        a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
        im = Image.open(f).convert('RGB'); small = np.asarray(im.resize((280, 280))).astype(np.float32)
        bgs = np.clip(backdrop(small), 60, 255).astype(np.uint8)
        bg = np.asarray(Image.fromarray(bgs).resize(im.size, Image.BILINEAR)).astype(np.float32)
        out = np.clip(a / bg * 255 * 1.012, 0, 255).astype(np.uint8)
        Image.fromarray(out).save(os.path.join(DST, n + '.jpg'), quality=93)
        print('flat', n)
