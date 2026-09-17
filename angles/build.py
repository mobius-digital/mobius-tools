"""Builds the creator link (angles/).

app.src.js + icons.json -> app.js, and writes the page shell to every place
GitHub Pages must serve it from:
  angles/index.html            /angles/?b=<slug>
  angles/<slug>/index.html     one per brand in SLUGS, a clean 200 for link previews
  404.html                     any other /angles/<slug> still works (served as 404)
Run:  python angles/build.py
"""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SLUGS = ['party-patch', 'grunk-dolfer', 'dartee']   # add a brand here for a clean link preview
V = '1'

icons = json.load(open(os.path.join(HERE, 'icons.json'), encoding='utf-8'))
src = open(os.path.join(HERE, 'app.src.js'), encoding='utf-8').read()
open(os.path.join(HERE, 'app.js'), 'w', encoding='utf-8').write(src.replace('__ICONS__', json.dumps(icons)))

SHELL = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Creator angles</title>
<meta name="description" content="What to film this week: angles, openers, shot plans and proof. Updated by the brand.">
<meta property="og:title" content="Creator angles">
<meta property="og:description" content="What to film this week: angles, openers, shot plans and proof.">
<meta name="theme-color" content="#13202B">
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap">
<link rel="stylesheet" href="/angles/app.css?v={V}">
</head>
<body>
<div id="app"></div>
<noscript><p style="padding:40px;font-family:sans-serif">This page needs JavaScript to show the angles.</p></noscript>
<script src="/angles/app.js?v={V}"></script>
</body>
</html>
'''.replace('{V}', V)

open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(SHELL)
for s in SLUGS:
    os.makedirs(os.path.join(HERE, s), exist_ok=True)
    open(os.path.join(HERE, s, 'index.html'), 'w', encoding='utf-8').write(SHELL)

NOT_FOUND = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.png">
<script>
/* Any /angles/<slug> that has no folder of its own still opens its creator page. */
if (/^\/angles\/[a-z0-9-]+\/?$/i.test(location.pathname)) {
  document.write(%s);
}
</script>
</head>
<body style="font-family:system-ui,sans-serif;background:#F6F8FA;color:#13202B">
<div id="nf" style="max-width:520px;margin:18vh auto;padding:0 20px;text-align:center">
<h1 style="font-weight:600">Page not found</h1>
<p><a href="/">Mobius Digital tools</a></p>
</div>
<script>if (document.getElementById('app')) document.getElementById('nf').remove();</script>
</body>
</html>
'''
inner = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap">'
         f'<link rel="stylesheet" href="/angles/app.css?v={V}">'
         '<meta name="theme-color" content="#13202B">'
         '</head><body><div id="app"></div>'
         f'<script src="/angles/app.js?v={V}"></script>')
open(os.path.join(ROOT, '404.html'), 'w', encoding='utf-8').write(NOT_FOUND % json.dumps(inner).replace('</', '<' + chr(92) + '/'))
print('built', len(icons), 'icons,', len(SLUGS), 'brand shells')
