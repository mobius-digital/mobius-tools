// node sheet.mjs out.jpg cols tile bg file1 file2 ...   (transparent PNGs or video frames over a bg colour, tiled)
import { execFileSync } from 'node:child_process';
import ff from 'ffmpeg-static';
const [out, cols, tile, bg, ...files] = process.argv.slice(2);
const C = +cols, T = +tile, n = files.length, rows = Math.ceil(n / C);
const args = ['-y', '-hide_banner', '-loglevel', 'error'];
for (const f of files) args.push('-i', f);
let fc = '';
files.forEach((f, i) => { fc += `color=c=0x${bg}:s=${T}x${T}[b${i}];[${i}]scale=${T}:${T}:force_original_aspect_ratio=decrease[s${i}];[b${i}][s${i}]overlay=(W-w)/2:(H-h)/2:format=auto[t${i}];`; });
const pads = [];
for (let i = n; i < rows * C; i++) { fc += `color=c=0x${bg}:s=${T}x${T}[t${i}];`; pads.push(i); }
const layout = [...Array(rows * C).keys()].map(i => `${(i % C) * T}_${Math.floor(i / C) * T}`).join('|');
fc += [...Array(rows * C).keys()].map(i => `[t${i}]`).join('') + `xstack=inputs=${rows * C}:layout=${layout}:fill=0x${bg}[o]`;
args.push('-filter_complex', fc, '-map', '[o]', '-frames:v', '1', '-q:v', '3', out);
execFileSync(ff, args, { stdio: 'inherit' });
console.log('wrote', out);
