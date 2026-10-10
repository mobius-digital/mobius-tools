// node checkpage.mjs: loads Locus locally, checks the intro plays, does not replay within 10 minutes, ?intro=1 forces it
import { chromium } from 'playwright-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.argv[2]; const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webm': 'video/webm', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => srv.listen(8799 + 50, '127.0.0.1', r));
const base = 'http://127.0.0.1:8849/profit/index.html';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[err]', e.message));
  const state = () => page.evaluate(() => { const el = document.querySelector('mobius-loader[mode="load"]'); const v = el && el.querySelector('video'); return { present: !!el, still: el ? el.classList.contains('still') : null, src: v ? v.currentSrc.split('/').pop() : null, t: v ? +v.currentTime.toFixed(2) : null, at: localStorage.getItem('locus_intro_at') ? 'set' : 'none' }; });
  await page.goto(base); await page.waitForTimeout(1500);
  console.log(name, 'first load @1.5s', JSON.stringify(await state()));
  await page.screenshot({ path: `shot-${name}-1.5s.png` });
  await page.waitForTimeout(2600);
  console.log(name, 'first load @4.1s', JSON.stringify(await state()));
  await page.reload(); await page.waitForTimeout(400);
  console.log(name, 'reload within 10 min', JSON.stringify(await state()));
  await page.goto(base + '?intro=1'); await page.waitForTimeout(800);
  console.log(name, '?intro=1', JSON.stringify(await state()));
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  console.log(name, 'after Escape', JSON.stringify(await state()));
  await page.evaluate(() => localStorage.setItem('locus_intro_at', String(Date.now() - 11 * 60 * 1000)));
  await page.goto(base); await page.waitForTimeout(500);
  console.log(name, 'reload after 11 min', JSON.stringify(await state()));
  await ctx.close();
}
const rm = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const p2 = await rm.newPage(); await p2.goto(base); await p2.waitForTimeout(300);
console.log('reduced motion', JSON.stringify(await p2.evaluate(() => { const el = document.querySelector('mobius-loader[mode="load"]'); return { present: !!el, still: el && el.classList.contains('still'), video: !!(el && el.querySelector('video')) }; })));
await browser.close(); srv.close();
