/* Makes the lists from the code:
     engine/docs/routes.md, forwarded.md, statements.md, metrics.md   the docs
     profit/v5/engine-paths.js                                        the paths the screens may send to the engine
   Run: node engine/worker/tools/gen-lists.mjs           writes them
        node engine/worker/tools/gen-lists.mjs --check   fails when one is stale */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const WORKER = fileURLToPath(new URL('../', import.meta.url));
const DOCS = join(WORKER, '..', 'docs');
const SCREENS = join(WORKER, '..', '..', 'profit', 'v5');
const load = rel => import(pathToFileURL(join(WORKER, 'src', rel)).href);

const { domains } = await load('domains.js');
const { buildTable, describe } = await load('platform/table.js');
const { registered } = await load('platform/db.js');
const { DEFINITIONS } = await load('numbers/defs.js');

const rows = buildTable(domains).rows.map(describe);
const cell = text => String(text ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const table = (head, lines) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...lines.map(l => `| ${l.map(cell).join(' | ')} |`)].join('\n');
const byPath = (a, b) => (a.path + a.method < b.path + b.method ? -1 : 1);
const NOTE = 'Made by `node engine/worker/tools/gen-lists.mjs`. Do not edit by hand.';
const ported = rows.filter(r => r.engine === 'new');

function routesMd() {
  const parts = [`# Routes\n\n${NOTE}\n\n${rows.length} routes: ${ported.length} answered by the engine (ported), ${rows.length - ported.length} forwarded to the old engine.`];
  for (const d of domains) {
    const mine = rows.filter(r => r.domain === d.name).sort(byPath);
    if (!mine.length) continue;
    parts.push(`## ${d.name}\n\n` + table(['Method', 'Path', 'Who', 'Brand', 'Answered by', 'What it is for'],
      mine.map(r => [r.method, `\`${r.path}\``, r.who, r.brand, r.engine === 'new' ? 'ported' : 'forwarded', r.doc])));
  }
  return parts.join('\n\n') + '\n';
}

function forwardedMd() {
  const mine = rows.filter(r => r.engine === 'forward').sort(byPath);
  const borrowed = rows.filter(r => r.borrows.length).sort(byPath);
  return [`# Forwarded\n\n${NOTE}\n\nThe to do list for the day the keys move to the engine. Each row is one forward to replace.`,
    table(['Method', 'Path', 'Old worker', 'Old file', 'Why it is forwarded'], mine.map(r => [r.method, `\`${r.path}\``, r.old, r.old_file, r.why])),
    `## Borrowed fields\n\nPorted routes that take a field from one old GET.`,
    borrowed.length ? table(['Method', 'Path', 'Fields'], borrowed.map(r => [r.method, `\`${r.path}\``, r.borrows.join(', ')])) : 'None.',
  ].join('\n\n') + '\n';
}

function statementsMd() {
  const all = registered().sort((a, b) => (a.name < b.name ? -1 : 1));
  return [`# Statements\n\n${NOTE}\n\nEvery statement the engine can run. ${all.length} in all, ${all.filter(q => q.write).length} of them writes.`,
    table(['Name', 'Scope', 'Write', 'Why no brand', 'SQL'], all.map(q => [q.name, q.scope, q.write ? 'yes' : '', q.why, `\`${q.sql}\``])),
  ].join('\n\n') + '\n';
}

function metricsMd() {
  return [`# Numbers\n\n${NOTE}\n\nThe ${DEFINITIONS.length} numbers defined in engine/worker/src/numbers/catalog.js. The screens read the same list from GET /v1/metrics/definitions.`,
    table(['Id', 'Name', 'Unit', 'Returns', 'What it means', 'Formula', 'Source', 'Old keys'],
      DEFINITIONS.map(d => [d.id, d.name, d.unit, d.returns, d.definition, d.formula, d.source, (d.old_keys || []).join(', ')])),
  ].join('\n\n') + '\n';
}

/* The screens send a call to the engine only when its method and path are in this list. A ported POST is
   left out on purpose: the screens retry the old engine when the new one fails, and a POST that makes
   a new row must never run twice. */
function screenPaths() {
  const keys = ported.filter(r => !r.path.startsWith('/v1/') && r.method !== 'POST').map(r => `${r.method} ${r.path}`).sort();
  const ignore = {};
  for (const r of ported) if (r.ignore.length) ignore[`${r.method} ${r.path}`] = r.ignore;
  return ['/* Made by `node engine/worker/tools/gen-lists.mjs`. Do not edit by hand.',
    '   The calls the engine answers with its own code (ported). "/ah" is the account-health worker\'s paths,',
    '   "/pw" the profit worker\'s. ":id" stands for one path part. Everything else stays on the old engine. */',
    `export const PORTED = ${JSON.stringify(keys, null, 2)};`,
    '', '/* Answer keys that change by the second, per call. The compare page leaves them out. */',
    `export const IGNORE = ${JSON.stringify(ignore, null, 2)};`, ''].join('\n');
}

const files = [[join(DOCS, 'routes.md'), routesMd()], [join(DOCS, 'forwarded.md'), forwardedMd()],
  [join(DOCS, 'statements.md'), statementsMd()], [join(DOCS, 'metrics.md'), metricsMd()]];
if (existsSync(SCREENS)) files.push([join(SCREENS, 'engine-paths.js'), screenPaths()]);

const check = process.argv.includes('--check');
const stale = [];
for (const [file, text] of files) {
  const have = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (have === text) continue;
  if (check) { stale.push(file.slice(join(WORKER, '..', '..').length + 1).replace(/\\/g, '/')); continue; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
if (stale.length) {
  console.log(`gen-lists: stale: ${stale.join(', ')}. Run node engine/worker/tools/gen-lists.mjs`);
  process.exit(1);
}
console.log(`gen-lists: ${check ? 'up to date' : 'written'} (${rows.length} routes, ${ported.length} ported)`);
