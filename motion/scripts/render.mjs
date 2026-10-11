// Render the spots. Bundles once, then renders every composition asked for,
// and prints how long each took. Output goes to out/ (gitignored).
//
//   node scripts/render.mjs            all four MP4s and the two posters
//   node scripts/render.mjs cashew     the Cashew spot, both formats
//   node scripts/render.mjs locus      the Locus spot, both formats
//   node scripts/render.mjs posters    the two 1080x1920 poster frames only
//   node scripts/render.mjs CashewVertical LocusLandscape   named compositions
//
// Settings (browser path, CRF, renderer) come from remotion.config.ts.
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { ConfigInternals } from '@remotion/cli/config';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'out');
mkdirSync(outDir, { recursive: true });

// Load remotion.config.ts the way the CLI does, so one file holds the settings.
await import(join(root, 'remotion.config.ts')).catch(async () => {
  // Node cannot import .ts directly on older versions; the CLI reads it via
  // esbuild. Fall back to the same values written here.
});
const browserExecutable = process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const crf = 28;
const gl = 'angle';

const ids = { cashew: ['CashewVertical', 'CashewLandscape'], locus: ['LocusVertical', 'LocusLandscape'] };
const posters = { CashewVertical: 'cashew-poster.png', LocusVertical: 'locus-poster.png' };
// The poster frame of each spot, as a share of the length: the circled number for Cashew, the calls for Locus.
const posterShare = { CashewVertical: 0.667, LocusVertical: 0.68 };

const args = process.argv.slice(2);
let toRender = [];
let doPosters = false;
if (args.length === 0) {
  toRender = [...ids.cashew, ...ids.locus];
  doPosters = true;
} else {
  for (const a of args) {
    if (a === 'cashew' || a === 'locus') toRender.push(...ids[a]);
    else if (a === 'posters') doPosters = true;
    else toRender.push(a);
  }
}

const t0 = Date.now();
console.log(`Bundling src/index.ts ...`);
const serveUrl = await bundle({
  entryPoint: join(root, 'src', 'index.ts'),
  webpackOverride: (c) => ConfigInternals.getWebpackOverrideFn()(c),
});
console.log(`Bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const concurrency = Math.max(1, Math.min(os.cpus().length, 4));
const fileName = (id) => id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.mp4';

for (const id of toRender) {
  const t = Date.now();
  const composition = await selectComposition({ serveUrl, id, browserExecutable, chromiumOptions: { gl } });
  const outputLocation = join(outDir, fileName(id));
  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf,
    imageFormat: 'jpeg',
    jpegQuality: 90,
    outputLocation,
    browserExecutable,
    chromiumOptions: { gl },
    concurrency,
    onProgress: ({ renderedFrames, encodedFrames }) => {
      const pct = Math.floor((renderedFrames / composition.durationInFrames) * 10) * 10;
      if (pct !== last && pct % 20 === 0) {
        last = pct;
        process.stdout.write(`  ${id}: ${pct}% (${renderedFrames} rendered, ${encodedFrames} encoded)\n`);
      }
    },
  });
  const secs = (Date.now() - t) / 1000;
  const mb = statSync(outputLocation).size / 1024 / 1024;
  console.log(`${id} -> out/${fileName(id)}  ${mb.toFixed(1)} MB  ${secs.toFixed(0)}s  (${composition.durationInFrames} frames, ${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);
}

if (doPosters) {
  for (const [id, file] of Object.entries(posters)) {
    const t = Date.now();
    const composition = await selectComposition({ serveUrl, id, browserExecutable, chromiumOptions: { gl } });
    const output = join(outDir, file);
    const frame = Math.round(composition.durationInFrames * posterShare[id]);
    await renderStill({
      composition,
      serveUrl,
      output,
      frame,
      imageFormat: 'png',
      browserExecutable,
      chromiumOptions: { gl },
    });
    console.log(`${id} frame ${frame} -> out/${file}  ${((Date.now() - t) / 1000).toFixed(1)}s`);
  }
}

console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s total.`);
