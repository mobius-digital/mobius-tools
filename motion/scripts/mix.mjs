// Measure the mix. Renders each spot's audio alone and in stems (voice, bed,
// sounds) to out/mix/, then reads them with ffmpeg's ebur128 filter: the
// integrated loudness, the true peak, and the bed's short term loudness under
// speech and between lines.
//
//   node scripts/mix.mjs            both spots
//   node scripts/mix.mjs cashew
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { ConfigInternals } from '@remotion/cli/config';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await import(join(root, 'remotion.config.ts')).catch(() => {});
const outDir = join(root, 'out', 'mix');
mkdirSync(outDir, { recursive: true });
const browserExecutable = process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const spots = process.argv[2] ? [process.argv[2]] : ['cashew', 'locus'];
const serveUrl = await bundle({ entryPoint: join(root, 'src', 'index.ts'), webpackOverride: (c) => ConfigInternals.getWebpackOverrideFn()(c) });

// ebur128 over a file: integrated, true peak, and the momentary (400 ms) series.
export const measure = (file) => {
  return spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true:framelog=info', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
};
const parse = (log) => {
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(log.split('Summary:')[1])?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(log.split('True peak:')[1] ?? '')?.[1]);
  const series = [...log.matchAll(/t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.]+)\s+S:\s*(-?[\d.]+)/g)].map((m) => ({ t: +m[1], M: +m[2], S: +m[3] }));
  return { I, TP, series };
};

for (const spot of spots) {
  const id = spot === 'cashew' ? 'CashewVertical' : 'LocusVertical';
  const res = {};
  for (const stem of ['all', 'voice', 'bed', 'sfx']) {
    const inputProps = stem === 'all' ? {} : { stem };
    const composition = await selectComposition({ serveUrl, id, browserExecutable, inputProps });
    const file = join(outDir, `${spot}-${stem}.wav`);
    await renderMedia({ composition, serveUrl, codec: 'wav', outputLocation: file, browserExecutable, inputProps });
    res[stem] = parse(measure(file));
  }
  // The speech windows from the voice stem: momentary loudness above -40.
  const v = res.voice.series;
  const bed = res.bed.series;
  const under = [];
  const gaps = [];
  bed.forEach((b, i) => {
    const speaking = (v[i]?.M ?? -120) > -40;
    if (b.M < -60) return;
    (speaking ? under : gaps).push(b.M);
  });
  const avgLU = (xs) => (xs.length ? 10 * Math.log10(xs.reduce((a, x) => a + 10 ** (x / 10), 0) / xs.length) : NaN);
  console.log(`${spot}: whole ${res.all.I} LUFS, true peak ${res.all.TP} dBTP | voice ${res.voice.I} LUFS, peak ${res.voice.TP} | bed ${res.bed.I} LUFS (under speech ${avgLU(under).toFixed(1)}, between lines ${avgLU(gaps).toFixed(1)}) | sounds ${res.sfx.I} LUFS, peak ${res.sfx.TP}`);
}
