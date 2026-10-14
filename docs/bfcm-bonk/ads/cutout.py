"""Real cut-outs of the Bonk studio photos (background removal only; Floyd allows it, nothing is drawn).
u2netp (rembg's small model, onnxruntime) gives the subject mask; OpenCV GrabCut refines the edge from it.
Model: %TEMP%/u2/u2netp.onnx (github.com/danielgatis/rembg releases). Writes assets/cut/<name>.png (RGBA, cropped).
Run: python cutout.py name1 name2 ..."""
import os, sys
import numpy as np, cv2, onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'assets'); DST = os.path.join(SRC, 'cut')
_o = ort.SessionOptions(); _o.enable_cpu_mem_arena = False; _o.enable_mem_pattern = False; _o.intra_op_num_threads = 1
SESS = ort.InferenceSession(os.path.join(os.environ.get('TEMP', '/tmp'), 'u2', 'u2netp.onnx'), sess_options=_o, providers=['CPUExecutionProvider'])


def u2mask(img):
    x = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (320, 320)).astype(np.float32) / 255.0
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    p = SESS.run(None, {SESS.get_inputs()[0].name: x})[0][0, 0]
    p = (p - p.min()) / (p.max() - p.min() + 1e-6)
    return cv2.resize(p, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)


def cut(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    p = u2mask(img)
    s = 800 / max(h, w); sm = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    ps = cv2.resize(p, (sm.shape[1], sm.shape[0]))
    mask = np.full(ps.shape, cv2.GC_PR_BGD, np.uint8)
    mask[ps > 0.35] = cv2.GC_PR_FGD
    mask[ps > 0.85] = cv2.GC_FGD
    mask[ps < 0.04] = cv2.GC_BGD
    bg, fg = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(sm, mask, None, bg, fg, 4, cv2.GC_INIT_WITH_MASK)
    m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        keep = np.zeros_like(m); big = stats[1:, cv2.CC_STAT_AREA].max()
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] > 0.03 * big: keep[lbl == i] = 255
        m = keep
    a = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)
    a = cv2.GaussianBlur(a, (5, 5), 1.0)
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA); rgba[..., 3] = a
    ys, xs = np.where(a > 10); pad = 6
    return rgba[max(0, ys.min() - pad):ys.max() + pad, max(0, xs.min() - pad):xs.max() + pad]


if __name__ == '__main__':
    os.makedirs(DST, exist_ok=True)
    for n in sys.argv[1:]:
        f = next(os.path.join(SRC, x) for x in os.listdir(SRC) if os.path.splitext(x)[0] == n)
        cv2.imwrite(os.path.join(DST, n + '.png'), cut(f)); print('cut', n)
