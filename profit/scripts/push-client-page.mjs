#!/usr/bin/env node
/* Push a client report page to Locus (profit/worker/src/clientpage.js). Same slug again = same link, new content.
 *   LOCUS_TOKEN=<admin token or Locus session> node profit/scripts/push-client-page.mjs <file.html> <slug> "<title>" <act>[,<act>...]
 * Prints the public link (locus.go-mobius-digital.com/profit/r.html?t=...). The source lives in profit/client-reports/. */
import { readFileSync } from 'node:fs';
const [file, slug, title, acts] = process.argv.slice(2);
const token = process.env.LOCUS_TOKEN;
if (!file || !slug || !title || !acts || !token) { console.error('usage: LOCUS_TOKEN=... node push-client-page.mjs <file.html> <slug> "<title>" <act>[,<act>]'); process.exit(1); }
const worker = process.env.PF_WORKER || 'https://mobius-profit.mobius-digital.workers.dev';
const r = await fetch(`${worker}/api/client-page`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ slug, title, acts: acts.split(','), html: readFileSync(file, 'utf8') }) });
const j = await r.json().catch(() => ({}));
if (!r.ok) { console.error(r.status, j.error || j); process.exit(1); }
console.log(`${j.replaced ? 'Updated' : 'Created'} ${j.slug} for ${j.brands.join(' + ')}\n${j.url}`);
