"""Cashew, round two: three real directions, written as clean SVG.

1. The curl: the C of Cashew as a thick geometric curl that suggests the
   kidney. Solid fill, currentColor, 64 grid.
2. The wordmark: "cashew" as a monoline geometric lowercase, drawn as paths
   (round caps, one stroke), with the c alone as the app icon.
3. The character: a soft kidney with a lighter belly, two dot eyes, a mouth
   and a stem cap, in four states; its silhouette is the mark.
"""
import math, os, re, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logo", "cashew", "round-2")


def f(v):
    s = f"{v:.2f}".rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def lines(markup, indent):
    parts = re.split(r'(?<=>)(?=<)', markup)
    return ''.join(' ' * indent + p + '\n' for p in parts if p)


def svg(title, body, vb='0 0 64 64', root='', defs=''):
    out = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{root}>\n  <title>{title}</title>\n'
    if defs:
        out += '  <defs>\n' + lines(defs, 4) + '  </defs>\n'
    return out + lines(body, 2) + '</svg>\n'


def bez(pts):
    """Catmull-Rom through the samples as cubic curves."""
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else pts[i + 1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        out.append(f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}')
    return ''.join(out)


def band(centre, width, n=14, closed_caps=True):
    """A solid band around a parametric centreline with a width function.
    centre(t) -> (x, y, tangent angle in radians); width(t) -> full width."""
    ts = [i / n for i in range(n + 1)]
    outer, inner = [], []
    for t in ts:
        x, y, a = centre(t)
        w = width(t) / 2
        nx, ny = -math.sin(a), math.cos(a)
        outer.append((x + nx * w, y + ny * w))
        inner.append((x - nx * w, y - ny * w))
    inner = inner[::-1]
    w1, w0 = width(1) / 2, width(0) / 2
    d = f'M{f(outer[0][0])} {f(outer[0][1])}' + bez(outer)
    d += f'A{f(w1)} {f(w1)} 0 0 1 {f(inner[0][0])} {f(inner[0][1])}' + bez(inner)
    d += f'A{f(w0)} {f(w0)} 0 0 1 {f(outer[0][0])} {f(outer[0][1])}Z'
    return d


# ---- 1. the curl -------------------------------------------------------------

CURL = dict(r=15, w=14, top=292, bot=68, hook_r=6.5, hook_deg=92, hook_end='top')


def curl_d(P=CURL, cx=32, cy=32):
    """A thick C drawn as one stroke along an arc, open to the right; at one
    end the arc tightens into a hook that turns into the mouth of the C."""
    r, w = P['r'], P['w']

    def pt(c, rr, deg):
        a = math.radians(deg)
        return c[0] + rr * math.cos(a), c[1] + rr * math.sin(a)
    C = (cx, cy)
    top = pt(C, r, P['top'])
    bot = pt(C, r, P['bot'])
    hr = P['hook_r']
    large = 1 if (P['top'] - P['bot']) % 360 > 180 else 0
    if P['hook_end'] == 'top':
        # the hook circle sits inside the C, tangent at the top end; the stroke
        # runs from the hook's tip, round to the top, then down the left side
        hc = pt(C, r - hr, P['top'])
        end = pt(hc, hr, P['top'] + P['hook_deg'])
        return (f'M{f(end[0])} {f(end[1])}A{f(hr)} {f(hr)} 0 0 0 {f(top[0])} {f(top[1])}'
                f'A{r} {r} 0 {large} 0 {f(bot[0])} {f(bot[1])}')
    hc = pt(C, r - hr, P['bot'])
    end = pt(hc, hr, P['bot'] - P['hook_deg'])
    return (f'M{f(top[0])} {f(top[1])}A{r} {r} 0 {large} 0 {f(bot[0])} {f(bot[1])}'
            f'A{f(hr)} {f(hr)} 0 0 0 {f(end[0])} {f(end[1])}')


def curl():
    d = curl_d()
    root = f' fill="none" stroke="currentColor" stroke-width="{CURL["w"]}" stroke-linecap="round" stroke-linejoin="round"'
    return svg('Cashew, the curl', f'<path d="{d}"/>', root=root)


# ---- 2. the wordmark ---------------------------------------------------------

WM = dict(x=26, s=5.6, gap=6.5, asc=12, hook=70)


def glyphs(P=WM):
    """Monoline geometric lowercase, drawn on an x-height grid.
    Returns (paths, total width). Baseline is y=0, x-height up to y=-x."""
    X, s, gap = P['x'], P['s'], P['gap']
    r = (X - s) / 2            # radius of a round letter's centreline
    mid = -X / 2
    out = []
    cur = s / 2

    def pt(cx, cy, rr, deg):
        a = math.radians(deg)
        return cx + rr * math.cos(a), cy + rr * math.sin(a)

    # c: an open circle; the top terminal curls further in than usual
    cx = cur + r
    a_bot, a_top = 48, 312
    x1, y1 = pt(cx, mid, r, a_bot)
    x2, y2 = pt(cx, mid, r, a_top)
    # the top terminal curls inward: a tighter arc continuing the same turn
    hr = r * 0.38
    hc = pt(cx, mid, r - hr, a_top)
    x3, y3 = pt(hc[0], hc[1], hr, a_top + P['hook'])
    out.append(f'M{f(x1)} {f(y1)}A{f(r)} {f(r)} 0 1 1 {f(x2)} {f(y2)}A{f(hr)} {f(hr)} 0 0 1 {f(x3)} {f(y3)}')
    cur += 2 * r + gap

    # a: a bowl with a stem on the right
    cx = cur + r
    out.append(f'M{f(cx + r)} {f(mid)}A{f(r)} {f(r)} 0 1 0 {f(cx + r)} {f(mid + 0.01)}Z'.replace('Z', ''))
    out.append(f'M{f(cx + r)} {f(-X + s / 2)}V{f(-s / 2)}')
    cur += 2 * r + gap

    # s: two half circles, one above the other, open at the ends
    rs = (X - s) / 4
    cx = cur + rs
    top_c, bot_c = mid - rs, mid + rs
    x1, y1 = pt(cx, top_c, rs, 330)
    x2, y2 = pt(cx, top_c, rs, 90)
    x3, y3 = pt(cx, bot_c, rs, 150)
    out.append(f'M{f(x1)} {f(y1)}A{f(rs)} {f(rs)} 0 1 0 {f(x2)} {f(y2)}A{f(rs)} {f(rs)} 0 1 1 {f(x3)} {f(y3)}')
    cur += 2 * rs + gap

    # h: a stem with an arch
    ra = r * 0.85
    out.append(f'M{f(cur)} {f(-X - P["asc"] + s / 2)}V{f(-s / 2)}')
    out.append(f'M{f(cur)} {f(-ra - s / 2)}A{f(ra)} {f(ra)} 0 0 1 {f(cur + 2 * ra)} {f(-ra - s / 2)}V{f(-s / 2)}')
    cur += 2 * ra + gap

    # e: a circle with a bar, open at the lower right
    cx = cur + r
    x1, y1 = pt(cx, mid, r, 0)
    x2, y2 = pt(cx, mid, r, 42)
    out.append(f'M{f(x1)} {f(y1)}A{f(r)} {f(r)} 0 1 0 {f(x2)} {f(y2)}')
    out.append(f'M{f(cx - r)} {f(mid)}H{f(cx + r)}')
    cur += 2 * r + gap

    # w: two bowls side by side
    rw = r * 0.62
    x0 = cur
    top = -X + s / 2
    out.append(f'M{f(x0)} {f(top)}V{f(-rw - s / 2)}A{f(rw)} {f(rw)} 0 0 0 {f(x0 + 2 * rw)} {f(-rw - s / 2)}'
               f'V{f(-rw - s / 2)}A{f(rw)} {f(rw)} 0 0 0 {f(x0 + 4 * rw)} {f(-rw - s / 2)}V{f(top)}')
    out.append(f'M{f(x0 + 2 * rw)} {f(-rw - s / 2)}V{f(-X * 0.62)}')
    cur += 4 * rw + s / 2
    return out, cur


def wordmark():
    P = WM
    paths, w = glyphs(P)
    H = P['x'] + P['asc'] + P['s']
    body = ''.join(f'<path d="{d}"/>' for d in paths)
    root = (f' fill="none" stroke="currentColor" stroke-width="{P["s"]}" stroke-linecap="round" stroke-linejoin="round"')
    vb = f'0 {f(-P["x"] - P["asc"] - P["s"] / 2)} {f(w + P["s"] / 2)} {f(H)}'
    return svg('Cashew wordmark', body, vb=vb, root=root)


def c_icon():
    """The c alone, as the app icon: thicker, on the 64 grid."""
    s, r = 10, 19
    a_bot, a_top = 48, 312

    def pt(c, rr, deg):
        a = math.radians(deg)
        return c[0] + rr * math.cos(a), c[1] + rr * math.sin(a)
    x1, y1 = pt((32, 32), r, a_bot)
    x2, y2 = pt((32, 32), r, a_top)
    hr = r * 0.38
    hc = pt((32, 32), r - hr, a_top)
    x3, y3 = pt(hc, hr, a_top + WM['hook'])
    body = f'<path d="M{f(x1)} {f(y1)}A{r} {r} 0 1 1 {f(x2)} {f(y2)}A{f(hr)} {f(hr)} 0 0 1 {f(x3)} {f(y3)}"/>'
    root = f' fill="none" stroke="currentColor" stroke-width="{s}" stroke-linecap="round" stroke-linejoin="round"'
    return svg('Cashew, the c', body, root=root)


# ---- 3. the character --------------------------------------------------------

CHAR = dict(body='#1E7A52', belly='#5CC395', cap='#13573A', ink='#0C161D')

# the kidney, clockwise from the top of the head: a plump bean with a big
# head lobe at the upper left, a smaller tail lobe at the lower right and a
# soft dent between them on the upper right
BEAN = [(22, 11), (12, 18), (9, 30), (13, 43), (24, 52), (38, 53), (49, 47), (54, 37),
        (52, 29), (45, 29), (38, 24), (33, 15)]


def closed_bez(pts):
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        out.append(f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}')
    return f'M{f(pts[0][0])} {f(pts[0][1])}' + ''.join(out) + 'Z'


def bean_d(dx=0, dy=0, scale=1.0, about=(32, 33)):
    pts = [(about[0] + (x - about[0]) * scale + dx, about[1] + (y - about[1]) * scale + dy) for x, y in BEAN]
    return closed_bez(pts)


def cap_d(dy=0):
    """The stem cap: a small soft cap sitting on the top of the head."""
    pts = [(17, 9 + dy), (24, 7 + dy), (29.5, 10 + dy), (26, 13 + dy), (19.5, 13.5 + dy)]
    return closed_bez(pts)


def face(state, fx, fy, ink):
    if state == 'asleep':
        return ''.join(f'<path d="M{f(fx + sx - 1.7)} {f(fy - 1.2)}h3.4" stroke="{ink}" stroke-width="1.9" stroke-linecap="round" fill="none"/>' for sx in (-4, 4)) + \
            f'<path d="M{f(fx - 1.2)} {f(fy + 4)}h2.4" stroke="{ink}" stroke-width="1.9" stroke-linecap="round" fill="none"/>'
    if state == 'thinking':
        return ''.join(f'<circle cx="{f(fx + sx + 1.8)}" cy="{f(fy - 2.6)}" r="2" fill="{ink}"/>' for sx in (-4, 4)) + \
            f'<path d="M{f(fx + 0.6)} {f(fy + 4)}h2.8" stroke="{ink}" stroke-width="1.9" stroke-linecap="round" fill="none"/>'
    if state == 'found':
        return ''.join(f'<circle cx="{f(fx + sx)}" cy="{f(fy - 1.8)}" r="2.6" fill="{ink}"/>' for sx in (-4.4, 4.4)) + \
            f'<circle cx="{f(fx)}" cy="{f(fy + 4.4)}" r="1.9" fill="{ink}"/>'
    if state == 'clear':
        return ''.join(f'<path d="M{f(fx + sx - 1.9)} {f(fy - 1)}a1.9 1.9 0 0 1 3.8 0" stroke="{ink}" stroke-width="1.9" stroke-linecap="round" fill="none"/>' for sx in (-4, 4)) + \
            f'<path d="M{f(fx - 3)} {f(fy + 3)}a3 3 0 0 0 6 0" stroke="{ink}" stroke-width="1.9" stroke-linecap="round" fill="none"/>'
    # at rest: open eyes, a small flat mouth
    return ''.join(f'<circle cx="{f(fx + sx)}" cy="{f(fy - 1.6)}" r="2" fill="{ink}"/>' for sx in (-4, 4)) + \
        f'<path d="M{f(fx - 2)} {f(fy + 4)}h4" stroke="{ink}" stroke-width="1.9" stroke-linecap="round" fill="none"/>'


def character(state=None):
    P = CHAR
    lift = 1.5 if state == 'found' else (-1 if state == 'clear' else 0)
    body = f'<path d="{bean_d(dy=-lift)}" fill="{P["body"]}"/>'
    body += f'<path d="{bean_d(dx=-2, dy=3.5 - lift, scale=0.58)}" fill="{P["belly"]}"/>'
    body += f'<path d="{cap_d(dy=-lift)}" fill="{P["cap"]}"/>'
    body += face(state, 23, 28 - lift, P['ink'])
    title = 'Cashew, the character' + (f', {state}' if state else '')
    if state == 'asleep':
        return svg(title, f'<g opacity=".78">{body}</g>')
    return svg(title, body)


def character_mark():
    """The silhouette: body and cap as one solid shape in currentColor."""
    body = f'<path d="{bean_d()}" fill="currentColor"/><path d="{cap_d()}" fill="currentColor"/>'
    return svg('Cashew, the character as a mark', body)


FILES = {
    'curl.svg': lambda: curl(),
    'wordmark.svg': wordmark,
    'c-icon.svg': c_icon,
    'character-mark.svg': character_mark,
    'character.svg': lambda: character(None),
    'character-asleep.svg': lambda: character('asleep'),
    'character-thinking.svg': lambda: character('thinking'),
    'character-found.svg': lambda: character('found'),
    'character-clear.svg': lambda: character('clear'),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in FILES.items():
        with open(os.path.join(OUT, name), 'w') as fh:
            fh.write(fn())
    print('ok', len(FILES))


if __name__ == '__main__':
    main()
