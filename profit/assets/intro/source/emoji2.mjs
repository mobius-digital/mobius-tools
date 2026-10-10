// Slack emoji from the path-traced loop: node emoji2.mjs [emoDir=emo] [still=12]
// Expects emo/e000..e039.png (512x512, transparent) from: node render2.mjs --out emo --emoji 40 --w 512 --h 512 --sub 4 --spp 48
// Writes out/emoji-ffmpeg.gif (palettegen + sierra2_4a), out/emoji-gifski.gif, out/mobius-emoji.png (still).
import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
import ff from 'ffmpeg-static';
const dir = process.argv[2] || 'emo', still = +(process.argv[3] || 12);
const small = 'emo128'; fs.mkdirSync(small, { recursive: true }); fs.mkdirSync('out', { recursive: true });
const run = (bin, a) => execFileSync(bin, a, { stdio: 'inherit' });
// premultiply, area-downscale, un-premultiply: no dark or light fringe on the edge
run(ff, ['-y', '-hide_banner', '-loglevel', 'error', '-i', `${dir}/e%03d.png`, '-vf', 'premultiply=inplace=1,scale=128:128:flags=area,unpremultiply=inplace=1', `${small}/e%03d.png`]);
run(ff, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', '20', '-i', `${small}/e%03d.png`, '-filter_complex',
  '[0]split[a][b];[a]palettegen=max_colors=255:reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=128:diff_mode=rectangle',
  '-loop', '0', 'out/emoji-ffmpeg.gif']);
const gifski = path.join('node_modules', 'gifski', 'bin', 'windows', 'gifski.exe');
const frames = fs.readdirSync(small).filter(f => f.endsWith('.png')).sort().map(f => path.join(small, f));
run(gifski, ['--fps', '20', '--quality', '92', '--width', '128', '-o', 'out/emoji-gifski.gif', ...frames]);
fs.copyFileSync(path.join(small, `e${String(still).padStart(3, '0')}.png`), 'out/mobius-emoji.png');
for (const f of ['emoji-ffmpeg.gif', 'emoji-gifski.gif', 'mobius-emoji.png']) console.log(f, Math.round(fs.statSync('out/' + f).size / 1024) + 'KB');
