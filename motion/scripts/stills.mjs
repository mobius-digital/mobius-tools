// Render a handful of frames of one composition as PNGs, for a look before a
// full render. Bundles once.
//
//   node scripts/stills.mjs KeptVertical 60 200 420 out/stills
//   node scripts/stills.mjs LocusLandscape every:90 out/stills
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { ConfigInternals } from '@remotion/cli/config';
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
if (rest[0]?.startsWith('every:')) {
  const step = Number(rest[0].slice(6));
  for (let f = 0; f < composition.durationInFrames; f += step) frames.push(f);
} else {
  frames = rest.map(Number);
}

for (const frame of frames) {
  const output = join(outDir, `${id}-${String(frame).padStart(4, '0')}.png`);
  await renderStill({ composition, serveUrl, output, frame, imageFormat: 'png', browserExecutable, chromiumOptions: { gl }, scale: 0.5 });
  console.log(output);
}
