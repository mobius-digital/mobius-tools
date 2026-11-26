/* The build rules (README.md, "Rules"). Prints every break and exits 1 when there is one.
   Run: node engine/worker/tools/check-rules.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative, sep } from 'node:path';

const ENGINE = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ENGINE, 'worker', 'src');
const MAX_FILE = 400, MAX_FUNCTION = 80;
const GROUPS = ['orgs', 'brands', 'metrics', 'store', 'ads', 'production', 'reports', 'automations', 'ai'];
const GROUP_MAY_IMPORT = /^\.\.\/platform\/(errors|text|time|log|settings|brands)\.js$|^\.\.\/numbers\/defs\.js$|^\.\.\/platform\/testkit\/index\.mjs$|^node:(test|assert|assert\/strict|fs|url|path)$/;
const KERNEL_IN_GROUP = new Set(['metrics/definitions.js']);
const SKIP_DIRS = new Set(['node_modules', '.bundle', '.wrangler']);
const TEXT = /\.(js|mjs|md|sql|toml|json)$/;
const DASHES = new RegExp(`[${String.fromCharCode(8211, 8212)}]`);
const breaks = [];
const say = (file, why) => breaks.push(`${relative(ENGINE, file).split(sep).join('/')}: ${why}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out); else if (TEXT.test(name)) out.push(full);
  }
  return out;
}

/* Blank out comments, strings, templates and regex literals, keeping every line break, so braces and
   words can be counted without being fooled by text. */
export function bare(code) {
  let out = '', i = 0, last = '';
  const blank = text => text.replace(/[^\n]/g, ' ');
  const until = (from, stop) => { let j = from; while (j < code.length && !stop(j)) j += code[j] === '\\' ? 2 : 1; return j; };
  while (i < code.length) {
    const c = code[i], two = code.slice(i, i + 2);
    if (two === '//') { const j = code.indexOf('\n', i); const end = j < 0 ? code.length : j; out += blank(code.slice(i, end)); i = end; continue; }
    if (two === '/*') { const j = code.indexOf('*/', i + 2); const end = j < 0 ? code.length : j + 2; out += blank(code.slice(i, end)); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const end = until(i + 1, j => code[j] === c) + 1;
      out += c + blank(code.slice(i + 1, end - 1)) + c; i = end; last = c; continue;
    }
    if (c === '/' && (last === '' || '(,=:[!&|?{};\n'.includes(last) || /(return|typeof|case)\s*$/.test(out.slice(-8)))) {
      let j = i + 1, inClass = false;
      while (j < code.length && (inClass || code[j] !== '/') && code[j] !== '\n') { if (code[j] === '\\') j++; else if (code[j] === '[') inClass = true; else if (code[j] === ']') inClass = false; j++; }
      out += ' ' + blank(code.slice(i + 1, j)) + ' '; i = j + 1; last = '/'; continue;
    }
    out += c;
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return out;
}

const NOT_A_FUNCTION = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);

/* Does the brace at `open` start a function body? It does after '=>' or after a ')' that does not
   close an if, for, while, switch or catch. */
function startsFunction(text, open) {
  const before = text.slice(0, open).trimEnd();
  if (before.endsWith('=>')) return true;
  if (!before.endsWith(')')) return false;
  let depth = 0, j = before.length - 1;
  for (; j >= 0; j--) { if (before[j] === ')') depth++; else if (before[j] === '(' && --depth === 0) break; }
  const word = (/([A-Za-z_$][\w$]*)\s*$/.exec(before.slice(0, j)) || [])[1] || '';
  return !NOT_A_FUNCTION.has(word);
}

function longFunctions(text) {
  const found = [], stack = [];
  let lineNo = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') lineNo++;
    else if (c === '{') stack.push({ line: lineNo, fn: startsFunction(text, i) });
    else if (c === '}') {
      const top = stack.pop();
      if (top && top.fn && lineNo - top.line + 1 > MAX_FUNCTION) found.push({ line: top.line, lines: lineNo - top.line + 1 });
    }
  }
  return found;
}

function checkCode(file, raw) {
  const rel = relative(SRC, file).split(sep).join('/');
  const inSrc = !rel.startsWith('..');
  const isTestFile = /\.test\.mjs$/.test(file) || rel.startsWith('platform/testkit/') || !inSrc;
  const lines = raw.split('\n').length;
  if (lines > MAX_FILE) say(file, `${lines} lines, the limit is ${MAX_FILE}`);
  const text = bare(raw);
  for (const f of longFunctions(text)) say(file, `a function of ${f.lines} lines starts at line ${f.line}, the limit is ${MAX_FUNCTION}`);
  if (isTestFile) return;
  if (/\.prepare\s*\(/.test(text) && rel !== 'platform/db.js') say(file, 'a database call outside platform/db.js');
  if (/(^|[^.\w])fetch\s*\(|\.fetch\s*\(/.test(text) && rel !== 'platform/legacy.js') say(file, 'an outside call (fetch) outside platform/legacy.js');
  if (/workers\.dev/.test(raw)) say(file, 'a worker address typed in code. Addresses live in wrangler.toml');
  const mail = raw.match(/[\w.+-]+@[\w-]+\.(com|io|co|net|org)\b/);
  if (mail) say(file, `an email address typed in code (${mail[0]})`);
  const group = rel.split('/')[0];
  if (GROUPS.includes(group) && !KERNEL_IN_GROUP.has(rel)) checkGroupFile(file, raw, text, rel);
}

function checkGroupFile(file, raw, text, rel) {
  for (const m of raw.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    const from = m[1];
    if (from.startsWith('./')) continue;
    if (!GROUP_MAY_IMPORT.test(from)) say(file, `imports ${from}. A group imports only from its own folder, platform/ (errors, text, time, log, settings, brands) and numbers/defs.js`);
  }
  if (/\benv\s*[.[]/.test(text)) say(file, 'reads env. A handler gets ctx');
  if (/\bnew\s+(Request|Response)\b/.test(text)) say(file, 'makes a Request or Response. A handler returns a plain object');
  if (/(?:^|\/)service\.js$|\/parts\//.test(rel) && !/\/\/ from \S+/.test(raw)) say(file, 'ported logic needs one comment line naming the old file: // from <old path>');
}

async function checkTable() {
  try {
    const { domains } = await import(pathToFileURL(join(SRC, 'domains.js')).href);
    const { buildTable } = await import(pathToFileURL(join(SRC, 'platform', 'table.js')).href);
    const table = buildTable(domains);
    return table.rows.length;
  } catch (e) {
    breaks.push(`route table: ${e.message}`);
    return 0;
  }
}

const files = walk(ENGINE);
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  if (DASHES.test(raw)) say(file, 'has an em dash or an en dash');
  if (/\.(js|mjs)$/.test(file)) checkCode(file, raw);
}
const rows = await checkTable();

if (breaks.length) {
  console.log(`check-rules: ${breaks.length} broken\n` + breaks.map(b => `  ${b}`).join('\n'));
  process.exit(1);
}
console.log(`check-rules: ok (${files.length} files, ${rows} route rows)`);
