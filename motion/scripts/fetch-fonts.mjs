// Fetch the two faces from Google Fonts once and keep them in public/fonts/,
// so a render never needs the network. Run with `npm run fonts`.
//
// Inter (variable weight, latin subset) is the text face. Instrument Serif
// italic is the accent word (logo/kit.css, "the accent word"). The CSS
// endpoint hands out woff2 only to a browser user agent, so one is sent.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'fonts');
mkdirSync(outDir, { recursive: true });

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const faces = [
  {
    file: 'inter-latin.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap',
  },
  {
    file: 'instrument-serif-italic-latin.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap',
  },
];

for (const face of faces) {
  const css = await (await fetch(face.css, { headers: { 'User-Agent': UA } })).text();
  // One @font-face per subset, each preceded by a comment naming the subset.
  const latin = css.match(/\/\*\s*latin\s*\*\/\s*@font-face\s*\{([^}]*)\}/)?.[1];
  const url = latin?.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!url) throw new Error(`no latin woff2 url for ${face.file}:\n${css}`);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(join(outDir, face.file), buf);
  console.log(`${face.file}  ${(buf.length / 1024).toFixed(0)} KB  <- ${url}`);
}
