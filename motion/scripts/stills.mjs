// Render frames of one composition as PNGs, for a look before a full render.
// Bundles once.
//
//   node scripts/stills.mjs CashewVertical 60 200 420 out/stills
//   node scripts/stills.mjs LocusLandscape every:90 out/stills
//   node scripts/stills.mjs CashewVertical sheet out/stills   one frame a second, tiled into a contact sheet
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { ConfigInternals } from '@remotion/cli/config';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
await import(join(root, 'remotion.config.ts')).catch(() => {});
const browserExecutable = process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const gl = 'angle';

const [id, ...rest] = process.argv.slice(2);
const dir = rest.pop();
const outDir = isAbsolute(dir) ? dir : join(root, dir);
mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({
  entryPoint: join(root, 'src', 'index.ts'),
  webpackOverride: (c) => ConfigInternals.getWebpackOverrideFn()(c),
});
const composition = await selectComposition({ serveUrl, id, browserExecutable, chromiumOptions: { gl } });

let frames = [];
let sheet = false;
if (rest[0]?.startsWith('every:')) {
  const step = Number(rest[0].slice(6));
  for (let f = 0; f < composition.durationInFrames; f += step) frames.push(f);
} else if (rest[0] === 'sheet') {
  sheet = true;
  for (let f = 0; f < composition.durationInFrames; f += composition.fps) frames.push(f);
} else {
  frames = rest.map(Number);
}

const scale = Number(process.env.STILL_SCALE ?? (sheet ? 0.25 : 0.5));
const files = [];
for (const frame of frames) {
  const output = join(outDir, `${id}-${String(frame).padStart(4, '0')}.png`);
  await renderStill({ composition, serveUrl, output, frame, imageFormat: 'png', browserExecutable, chromiumOptions: { gl }, scale });
  files.push(output);
  if (!sheet) console.log(output);
}
if (sheet) {
  // One frame a second, six across, labelled with the second.
  const cols = 6;
  const rows = Math.ceil(files.length / cols);
  const out = join(outDir, `${id}-sheet.png`);
  const w = Math.round(composition.width * scale);
  const h = Math.round(composition.height * scale);
  const inputs = files.flatMap((f) => ['-i', f]);
  const filters = files.map((_, i) => `[${i}:v]drawtext=text='${i}s':x=10:y=10:fontsize=${Math.round(h / 24)}:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=6[v${i}]`).join(';');
  const tile = files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * (w + 4)}_${Math.floor(i / cols) * (h + 4)}`).join('|')}:fill=white[out]`;
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', `${filters};${tile}`, '-map', '[out]', out]);
  console.log(out, `${cols}x${rows}`);
}
