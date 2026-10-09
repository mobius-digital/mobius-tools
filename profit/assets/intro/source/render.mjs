// Offline renderer for the Locus intro (profit/DESIGN.md section 7). Not served by the app.
// Setup, in a scratch folder OUTSIDE the repo: copy render.html, render.mjs, encode.ps1 there, then
//   npm i three@0.169.0 playwright-core@1.47.2 ffmpeg-static@5.2.0
// Frames:  node render.mjs --out full --all --sub 10          (193 frames, 1920x1080, transparent PNG)
// Emoji:   node render.mjs --out emo --emoji 40 --w 128 --h 128 --ss 4 --sub 6
// Encode:  ./encode.ps1 -crfW 26 -crfX 18   (square = centre crop 1080x1080)
// node render.mjs --out dir --times 0,0.8,1.6 | --all [--sub 8] [--w 1920 --h 1080] [--emoji N]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const A = {}; { const av = process.argv.slice(2); for (let i = 0; i < av.length; i++) if (av[i].startsWith('--')) { const k = av[i].slice(2); if (av[i + 1] != null && !av[i + 1].startsWith('--')) A[k] = av[++i]; else A[k] = true; } }
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const W = +(A.w || 1920), H = +(A.h || 1080), SUB = +(A.sub || 8), FPS = 60, DUR = +(A.dur || 3.2);
const out = A.out || 'frames'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('console', m => console.log('[page]', m.text())); page.on('pageerror', e => console.log('[err]', e.message));
await page.goto(`http://127.0.0.1:${port}/render.html?w=${W}&h=${H}&ss=${A.ss || 2}&msaa=${A.msaa || 4}&dur=${DUR}${A.q ? '&' + A.q : ''}`);
await page.waitForFunction('window.READY === true', null, { timeout: 60000 });
console.log('GPU', await page.evaluate('window.GPU'));
let list;
if (A.emoji) { const n = +A.emoji; list = [...Array(n).keys()].map(i => ({ name: `e${String(i).padStart(3, '0')}`, emo: i / n })); }
else if (A.all) list = [...Array(Math.round(DUR * FPS) + 1).keys()].map(i => ({ name: `f${String(i).padStart(4, '0')}`, t: i / FPS }));
else list = String(A.times).split(',').map(s => ({ name: `t${(+s).toFixed(2)}`, t: +s }));
const t0 = Date.now();
for (const it of list) {
  const url = await page.evaluate(([t, sub, emo]) => window.renderAt(t, sub, 0.5, 60, emo), [it.t ?? 0, SUB, it.emo ?? null]);
  fs.writeFileSync(path.join(out, it.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
}
console.log('rendered', list.length, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await browser.close(); srv.close();
