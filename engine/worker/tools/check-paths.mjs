/* Every path the new screens call must be in the route table. A path with no row still works (it is
   piped to the old worker and logged as unlisted), but it is not checked and not documented, so the
   build names it.
   Run: node engine/worker/tools/check-paths.mjs          exits 1 when a path is missing
        node engine/worker/tools/check-paths.mjs --warn   prints them and exits 0 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative, sep } from 'node:path';

const WORKER = fileURLToPath(new URL('../', import.meta.url));
const SCREENS = join(WORKER, '..', '..', 'profit', 'v5');
const load = rel => import(pathToFileURL(join(WORKER, 'src', rel)).href);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out); else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

/* The text of one call's arguments: from just after "api(" to its closing bracket. */
function argsOf(text, from) {
  let depth = 1, quote = '';
  for (let i = from; i < text.length && i < from + 1500; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if ((c === ')' || c === '}' || c === ']') && --depth === 0) return text.slice(from, i);
  }
  return text.slice(from, from + 300);
}

const tidy = raw => raw.replace(/\$\{[^}]*\}/g, ':id').replace(/\/+$/, '');

/* One call: api('/api/x?..', { worker: 'ah', method: 'PUT' }). The path is read up to the first '?',
   quote or '${'. A piece built at run time becomes ':id'. The options are read from the call's own
   brackets. Options kept in a name (const opt = { worker: 'ah' }) are looked up in the same file. */
function callsIn(text) {
  const found = [], taken = new Set();
  const re = /\bapi\(\s*(['"`])(\/api\/[^'"`?]*)/g;
  for (const m of text.matchAll(re)) {
    taken.add(m.index + m[0].length - m[2].length);
    let path = m[2].replace(/\$\{[^}]*\}/g, ':id');
    const args = argsOf(text, m.index + m[0].indexOf('(') + 1);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (path.endsWith('/') && /^['"]\s*\+/.test(after)) path += ':id';
    path = path.replace(/\/+$/, '');
    let opts = args;
    const named = /,\s*([A-Za-z_$][\w$]*)\s*$/.exec(args);
    if (named) opts = (new RegExp('\\b(?:const|let)\\s+' + named[1].replace(/\$/g, '\\$') + '\\s*=\\s*(\\{[^;\\n]*)').exec(text) || [])[1] || '';
    const worker = /worker:\s*['"]ah['"]/.test(opts) ? 'ah' : 'pw';
    const method = (/method:\s*['"]([A-Z]+)['"]/.exec(opts) || [])[1] || 'GET';
    found.push({ method, path: `/${worker}${path}` });
  }
  /* A path handed to a helper (ah(ctx, '/api/x')) is not inside api( ). Its worker and method are not
     known here, so it passes when any row has that path. */
  for (const m of text.matchAll(/(['"`])(\/api\/[a-z][^'"`?\s]*)/g)) {
    if (taken.has(m.index + 1)) continue;
    const before = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
    if (/^\s*(\/\/|\/?\*)/.test(before) || /\/\/|\/\*/.test(before)) continue;
    found.push({ method: '*', path: tidy(m[2]) });
  }
  return found;
}

if (!existsSync(SCREENS)) {
  console.log('check-paths: the screens folder profit/v5 is not here, nothing to check');
  process.exit(0);
}
const { domains } = await load('domains.js');
const { buildTable } = await load('platform/table.js');
const table = buildTable(domains);
const ANY = ['GET', 'PUT', 'POST', 'PATCH', 'DELETE'];
const known = c => (c.method === '*'
  ? ['/ah', '/pw'].some(w => ANY.some(m => table.match(m, w + c.path.replace(/:id/g, 'x'))))
  : !!table.match(c.method, c.path.replace(/:id/g, 'x')));
const missing = new Map();
let seen = 0;
for (const file of walk(SCREENS)) {
  for (const c of callsIn(readFileSync(file, 'utf8'))) {
    seen++;
    if (known(c)) continue;
    const key = c.method === '*' ? `any ${c.path}` : `${c.method} ${c.path}`;
    if (!missing.has(key)) missing.set(key, relative(SCREENS, file).split(sep).join('/'));
  }
}
const warn = process.argv.includes('--warn');
if (missing.size) {
  console.log(`check-paths: ${missing.size} of the paths the screens call have no row (${seen} calls read):`);
  for (const [key, file] of [...missing].sort()) console.log(`  ${key}   (${file})`);
  process.exit(warn ? 0 : 1);
}
console.log(`check-paths: ok (${seen} calls read, every path has a row)`);
