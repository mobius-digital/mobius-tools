// The two faces, bundled in public/fonts/ (npm run fonts fetches them once).
// loadFont holds the render until each face is ready.
import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

export const sans = 'Inter';
export const serif = 'Instrument Serif';

export const fontsReady = Promise.all([
  loadFont({
    family: sans,
    url: staticFile('fonts/inter-latin.woff2'),
    weight: '400 700',
  }),
  loadFont({
    family: serif,
    url: staticFile('fonts/instrument-serif-italic-latin.woff2'),
    style: 'italic',
    weight: '400',
  }),
]);

export const sansStack = `${sans}, system-ui, -apple-system, 'Segoe UI', sans-serif`;
export const serifStack = `'${serif}', Georgia, 'Times New Roman', serif`;
