"""Rebuilds the sprite and the kit CSS inside docs/brand/board.html.

Run from the repo root after changing any file in logo/:
    python3 docs/brand/build.py

The board stays one self-contained HTML file (it is published as an artifact
and opened straight from the repo), so the marks and logo/kit.css are copied
in between the markers below rather than linked.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BOARD = os.path.join(ROOT, 'docs', 'brand', 'board.html')
STATES = ['', 'asleep', 'thinking', 'found', 'clear']


def symbol_from(path, sid):
    s = open(path).read()
    m = re.search(r'<svg[^>]*viewBox="([^"]+)"[^>]*>(.*)</svg>', s, re.S)
    vb, inner = m.group(1), m.group(2)
    attrs = re.search(r'<svg([^>]*)>', s).group(1)
    attrs = re.sub(r'\s*xmlns="[^"]*"', '', attrs)
    attrs = re.sub(r'\s*viewBox="[^"]*"', '', attrs)
    inner = re.sub(r'\s*<title>.*?</title>', '', inner, flags=re.S)
    return f'<symbol id="{sid}" viewBox="{vb}"{attrs}>{inner.strip()}</symbol>'


def sprite():
    out = []
    for product in ('locus', 'kept'):
        for i in ((1, 2, 3) if product == 'locus' else (1, 2, 3, 4)):
            for st in STATES:
                name = f'direction-{i}' + (f'-{st}' if st else '')
                sid = f'{product}-{i}' + (f'-{st}' if st else '')
                out.append(symbol_from(os.path.join(ROOT, 'logo', product, name + '.svg'), sid))
    mob = open(os.path.join(ROOT, 'logo', 'mobius-mark-ink.svg')).read()
    d = re.search(r'<path d="([^"]+)"', mob).group(1)
    out.append(f'<symbol id="mobius" viewBox="0 0 2400 1655"><path d="{d}" fill="currentColor"/></symbol>')
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true">\n' + '\n'.join(out) + '\n</svg>'


def replace_between(html, start, end, body):
    a, b = html.index(start) + len(start), html.index(end)
    return html[:a] + '\n' + body + '\n' + html[b:]


def main():
    html = open(BOARD).read()
    html = replace_between(html, '<!-- marks:start -->', '<!-- marks:end -->', sprite())
    kit = open(os.path.join(ROOT, 'logo', 'kit.css')).read()
    html = replace_between(html, '/* kit:start */', '/* kit:end */', kit)
    if chr(0x2014) in html:
        sys.exit('an em dash got into the board')
    open(BOARD, 'w').write(html)
    print('board rebuilt:', len(html), 'bytes')


if __name__ == '__main__':
    main()
