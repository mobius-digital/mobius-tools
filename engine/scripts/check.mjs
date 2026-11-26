/* The one build check. Runs every check in engine/worker/tools and the tests, and exits 1 when any fails.
   Run: node engine/scripts/check.mjs            rules, lists, tests. Paths with no row are a warning
        node engine/scripts/check.mjs --strict   a path the screens call with no row also fails
        node engine/scripts/check.mjs --no-tests skip the tests
   What it checks:
   check-rules   file and function size, no database call outside platform/db.js, no outside call
                 outside platform/legacy.js, every route row has access and a doc, no dashes, a group
                 imports only what it may, no address typed in code
   gen-lists     engine/docs/ and profit/v5/engine-paths.js are up to date with the code
   check-paths   every path the new screens call is in the route table
   tests         node --test over the kernel tests and every group's tests (test/ and src/) */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const WORKER = fileURLToPath(new URL('../worker/', import.meta.url));
const strict = process.argv.includes('--strict');
const steps = [
  ['check-rules', ['tools/check-rules.mjs']],
  ['gen-lists', ['tools/gen-lists.mjs', '--check']],
  ['check-paths', ['tools/check-paths.mjs', ...(strict ? [] : ['--warn'])]],
];
if (!process.argv.includes('--no-tests')) steps.push(['tests', ['--test', '--test-reporter=dot', 'test/**/*.test.mjs', 'src/**/*.test.mjs']]);

let failed = 0;
for (const [name, args] of steps) {
  const run = spawnSync(process.execPath, ['--no-warnings', ...args], { cwd: WORKER, encoding: 'utf8' });
  const out = `${run.stdout || ''}${run.stderr || ''}`.trim();
  const ok = run.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (out && (!ok || name !== 'tests')) console.log(out.split('\n').map(l => `     ${l}`).join('\n'));
}
console.log(failed ? `\n${failed} of ${steps.length} checks failed` : `\nall ${steps.length} checks passed`);
process.exit(failed ? 1 : 0);
