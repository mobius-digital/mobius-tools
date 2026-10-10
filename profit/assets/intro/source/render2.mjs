// Offline path-traced renderer for the Locus intro v2 (profit/DESIGN.md section 7). Not served by the app.
// Setup, in a scratch folder OUTSIDE the repo: copy render2.html, render2.mjs, encode2.ps1, emoji2.ps1 there, then
//   npm i three@0.183.2 three-mesh-bvh@0.9.15 three-gpu-pathtracer@0.0.24 playwright-core@1.47.2 ffmpeg-static@5.2.0 gifski@1.7.1
// Frames:  node render2.mjs --out full --all --sub 8 --spp 32         (193 frames, 1920x1080, transparent PNG)
// Emoji:   node render2.mjs --out emo --emoji 40 --w 512 --h 512 --sub 4 --spp 48
// Looks:   node render2.mjs --out test --times 0.4,1.2,2.0,2.4,3.2 --sub 2 --spp 16 [--q "sat=1.4&env=1.1"]
// Resume:  --from N skips frames before N (a long render can be restarted).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const A = {}; { const av = process.argv.slice(2); for (let i = 0; i < av.length; i++) if (av[i].startsWith('--')) { const k = av[i].slice(2); if (av[i + 1] != null && !av[i + 1].startsWith('--')) A[k] = av[++i]; else A[k] = true; } }
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const W = +(A.w || 1920), H = +(A.h || 1080), SUB = +(A.sub || 8), SPP = +(A.spp || 32), SSPP = +(A.sspp || 24), FPS = 60, DUR = +(A.dur || 3.2);
const out = A.out || 'frames'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-angle=' + (A.angle || 'vulkan'), '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-watchdog', '--disable-features=GpuWatchdog'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('console', m => console.log('[page]', m.text())); page.on('pageerror', e => console.log('[err]', e.message));
await page.goto(`http://127.0.0.1:${port}/render2.html?w=${W}&h=${H}&dur=${DUR}${A.q ? '&' + A.q : ''}`);
await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
console.log('GPU', await page.evaluate('window.GPU'));
let list;
if (A.emoji) { const n = +A.emoji; list = [...Array(n).keys()].map(i => ({ name: `e${String(i).padStart(3, '0')}`, emo: i / n })); }
else if (A.all) list = [...Array(Math.round(DUR * FPS) + 1).keys()].map(i => ({ name: `f${String(i).padStart(4, '0')}`, t: i / FPS }));
else list = String(A.times).split(',').map(s => ({ name: `t${(+s).toFixed(2)}`, t: +s }));
if (A.from) list = list.slice(+A.from);
const t0 = Date.now();
for (const it of list) {
  const url = await page.evaluate(([t, sub, spp, emo, sspp]) => window.renderAt(t, sub, spp, 0.5, 60, emo, sspp), [it.t ?? 0, SUB, SPP, it.emo ?? null, SSPP]);
  fs.writeFileSync(path.join(out, it.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  const ms = await page.evaluate('window.LAST_MS');
  console.log(it.name, (ms / 1000).toFixed(2) + 's', JSON.stringify(await page.evaluate('(()=>{const r=window.TT; window.TT={}; return r;})()')));
}
console.log('rendered', list.length, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await browser.close(); srv.close();
